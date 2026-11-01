const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { preprocessCityTiers } = require('../preprocessing/preprocess-cities');
const { findCityTier, getAllCityTiers } = require('../node-src/db/dbClient');
const { cityTierTool } = require('../node-src/services/cityTierTool');
const CustomerSchema = require('../node-src/models/customerSchema');
const { SchemaExtractionAgent } = require('../node-src/services/extractor');
const { ConversationManager } = require('../node-src/services/conversationManager');
const { SessionStore } = require('../node-src/services/sessionStore');
const { SarvamClient } = require('../node-src/services/sarvamClient');

class MockSarvamClient extends SarvamClient {
  constructor(predefinedExtractions = {}) {
    super('mock_key', true);
    this.predefinedExtractions = predefinedExtractions;
  }

  async chatCompletion({ messages }) {
    const lastMsg = messages[messages.length - 1]?.content || '';
    if (lastMsg.includes('Extract any newly provided structured customer facts as JSON:')) {
      for (const [trigger, payload] of Object.entries(this.predefinedExtractions)) {
        if (lastMsg.toLowerCase().includes(trigger.toLowerCase())) {
          return JSON.stringify(payload);
        }
      }
      return '{}';
    }
    return 'Thank you. What is your approximate monthly budget?';
  }

  async transcribeAudio() {
    return 'Mock transcribed speech';
  }
}

test('City-to-Tier Preprocessor creates data/city_tier_mapping.json with expected schema', () => {
  const result = preprocessCityTiers();
  assert.ok(Array.isArray(result));
  assert.ok(result.length >= 22, `Expected >= 22 cities, got ${result.length}`);

  const sample = result.find(c => c.city === 'Mumbai');
  assert.ok(sample);
  assert.strictEqual(sample.city_tier, 1);
  assert.strictEqual(sample.state, 'Maharashtra');

  const jsonPath = path.resolve(__dirname, '../data/city_tier_mapping.json');
  assert.ok(fs.existsSync(jsonPath));
});

test('findCityTier accurately looks up Tier 1 and Tier 2 cities', async () => {
  // Tier 1 metros
  const mumbai = await findCityTier('Mumbai');
  assert.strictEqual(mumbai.matched, true);
  assert.strictEqual(mumbai.city_tier, 1);
  assert.strictEqual(mumbai.state, 'Maharashtra');

  const delhi = await findCityTier('Delhi');
  assert.strictEqual(delhi.matched, true);
  assert.strictEqual(delhi.city_tier, 1);

  // Tier 2 cities
  const jaipur = await findCityTier('Jaipur');
  assert.strictEqual(jaipur.matched, true);
  assert.strictEqual(jaipur.city_tier, 2);
  assert.strictEqual(jaipur.state, 'Rajasthan');

  const kochi = await findCityTier('Kochi');
  assert.strictEqual(kochi.matched, true);
  assert.strictEqual(kochi.city_tier, 2);
  assert.strictEqual(kochi.state, 'Kerala');
});

test('findCityTier resolves colloquial aliases and case variations', async () => {
  // Bangalore -> Bengaluru (Tier 1)
  const bangalore = await findCityTier('Bangalore');
  assert.strictEqual(bangalore.matched, true);
  assert.strictEqual(bangalore.city, 'Bengaluru');
  assert.strictEqual(bangalore.city_tier, 1);

  // Bombay -> Mumbai (Tier 1)
  const bombay = await findCityTier('bombay');
  assert.strictEqual(bombay.matched, true);
  assert.strictEqual(bombay.city, 'Mumbai');
  assert.strictEqual(bombay.city_tier, 1);

  // Vizag -> Visakhapatnam (Tier 2)
  const vizag = await findCityTier('Vizag');
  assert.strictEqual(vizag.matched, true);
  assert.strictEqual(vizag.city, 'Visakhapatnam');
  assert.strictEqual(vizag.city_tier, 2);

  // Gurugram -> Gurgaon (Tier 1)
  const gurugram = await findCityTier('Gurugram');
  assert.strictEqual(gurugram.matched, true);
  assert.strictEqual(gurugram.city, 'Gurgaon');
  assert.strictEqual(gurugram.city_tier, 1);
});

test('cityTierTool executes and applies tier and state into CustomerSchema', async () => {
  const schema = new CustomerSchema({
    business_type: 'Software Office',
    city: 'Hyderabad'
  });

  assert.strictEqual(schema.city_tier, null);
  assert.strictEqual(schema.state, null);

  const toolResult = await cityTierTool.execute({ city: schema.city });
  assert.strictEqual(toolResult.matched, true);
  assert.strictEqual(toolResult.city_tier, 1);
  assert.strictEqual(toolResult.state, 'Telangana');

  const diff = cityTierTool.applyToSchema(schema, toolResult);
  assert.strictEqual(schema.city_tier, 1);
  assert.strictEqual(schema.state, 'Telangana');
  assert.ok(diff.city_tier);
});

test('ConversationManager automatically calls cityTierTool when city is extracted', async () => {
  const mockResponses = {
    'dental clinic in hyderabad': {
      business_type: 'Dental Clinic',
      city: 'Hyderabad',
      employee_count: 5
    }
  };

  const client = new MockSarvamClient(mockResponses);
  const extractor = new SchemaExtractionAgent(client);
  const manager = new ConversationManager(extractor, client, new SessionStore());

  const response = await manager.handleMessage({
    message: 'I run a dental clinic in Hyderabad with 5 employees',
    sessionId: 'test_city_tier_session_' + Date.now()
  });

  assert.strictEqual(response.customer_schema.city, 'Hyderabad');
  assert.strictEqual(response.customer_schema.city_tier, 1);
  assert.strictEqual(response.customer_schema.state, 'Telangana');

  // Verify tool call was recorded in pipeline trace
  assert.ok(response.pipeline_trace.tool_calls);
  const cityToolCall = response.pipeline_trace.tool_calls.find(tc => tc.tool === 'lookup_city_tier');
  assert.ok(cityToolCall, 'lookup_city_tier tool call must be present in pipeline_trace');
  assert.strictEqual(cityToolCall.input.city, 'Hyderabad');
  assert.strictEqual(cityToolCall.output.city_tier, 1);
  assert.strictEqual(cityToolCall.status, 'success');
});

