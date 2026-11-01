const test = require('node:test');
const assert = require('node:assert/strict');
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

    return 'Thank you for sharing. Could you please let me know your approximate monthly budget?';
  }

  async transcribeAudio() {
    return 'Mock transcribed speech';
  }
}

test('Multi-entity extraction extracts business_type, num_sites, and employee_count in one turn', async () => {
  const mockResponses = {
    'restaurant with three branches and around twenty employees': {
      business_type: 'Restaurant',
      num_sites: 3,
      employee_count: 20,
      preferred_language: 'English'
    }
  };

  const client = new MockSarvamClient(mockResponses);
  const extractor = new SchemaExtractionAgent(client);
  const manager = new ConversationManager(extractor, client, new SessionStore());

  const resp = await manager.handleMessage({
    message: 'I own a restaurant with three branches and around twenty employees.'
  });

  assert.equal(resp.customer_schema.business_type, 'Restaurant');
  assert.equal(resp.customer_schema.num_sites, 3);
  assert.equal(resp.customer_schema.employee_count, 20);
  assert(!resp.missing_fields.includes('business_type'));
  assert(!resp.missing_fields.includes('num_sites'));
  assert(!resp.missing_fields.includes('employee_count'));
  assert.equal(resp.ready_for_recommendation, false);
});

test('Full discovery completion triggers ready_for_recommendation: true', async () => {
  const mockResponses = {
    'dental clinic': {
      business_type: 'Clinic',
      city: 'Pune',
      employee_count: 8,
      num_sites: 1,
      needs: ['Broadband', 'Cloud Backup'],
      budget: 2000,
      has_gstin: 'Y',
      has_udyam: 'Y',
      max_installation_days: 5,
      preferred_language: 'English'
    }
  };

  const client = new MockSarvamClient(mockResponses);
  const extractor = new SchemaExtractionAgent(client);
  const manager = new ConversationManager(extractor, client, new SessionStore());

  const resp = await manager.handleMessage({
    message: 'I run a dental clinic in Pune with 8 staff at 1 site. Needs broadband and budget is 2000.'
  });

  assert.equal(resp.customer_schema.business_type, 'Clinic');
  assert.equal(resp.customer_schema.city, 'Pune');
  assert.equal(resp.customer_schema.budget, 2000);
  assert.equal(resp.customer_schema.has_gstin, 'Y');
  assert.equal(resp.ready_for_recommendation, true);
  assert.deepEqual(resp.missing_fields, []);
  assert(resp.recommendations !== null);
});

test('Telugu language conversation discovery turn', async () => {
  const mockResponses = {
    'కిరాణా దుకాణం': {
      business_type: 'Kirana',
      city: 'విజయవాడ',
      employee_count: 4,
      num_sites: 1,
      preferred_language: 'Telugu'
    }
  };

  const client = new MockSarvamClient(mockResponses);
  const extractor = new SchemaExtractionAgent(client);
  const manager = new ConversationManager(extractor, client, new SessionStore());

  const resp = await manager.handleMessage({
    message: 'నా పేరు రమేష్, విజయవాడలో ఒక కిరాణా దుకాణం ఉంది.'
  });

  assert.equal(resp.customer_schema.business_type, 'Kirana');
  assert.equal(resp.customer_schema.city, 'విజయవాడ');
  assert.equal(resp.detected_language, 'Telugu');
});
