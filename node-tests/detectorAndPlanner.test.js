const test = require('node:test');
const assert = require('node:assert/strict');
const CustomerSchema = require('../node-src/models/customerSchema');
const { MissingInformationDetector, REQUIRED_FIELDS } = require('../node-src/services/detector');
const { QuestionPlanner, QUESTION_MAP } = require('../node-src/services/planner');

test('MissingInformationDetector on empty schema reports all required fields missing', () => {
  const schema = new CustomerSchema();
  const res = MissingInformationDetector.detect(schema);
  assert.equal(res.schema_complete, false);
  assert.deepEqual(res.missing_fields, REQUIRED_FIELDS);
  assert.equal(MissingInformationDetector.calculateCompletionPercentage(schema), 0);
});

test('MissingInformationDetector on complete schema reports schema_complete: true', () => {
  const schema = new CustomerSchema({
    business_type: 'Restaurant',
    employee_count: 20,
    num_sites: 3,
    city: 'Hyderabad',
    needs: ['WiFi', 'CCTV'],
    budget: 4500,
    has_gstin: 'Y',
    has_udyam: 'Y',
    max_installation_days: 7
  });
  const res = MissingInformationDetector.detect(schema);
  assert.equal(res.schema_complete, true);
  assert.deepEqual(res.missing_fields, []);
  assert.equal(MissingInformationDetector.calculateCompletionPercentage(schema), 100);
});

test('QuestionPlanner selects highest priority field deterministically', () => {
  const missing = ['monthly_telecom_spend_inr', 'city', 'business_type'];
  const plan = QuestionPlanner.selectNextQuestion(missing);
  assert.equal(plan.field, 'business_type');
  assert.equal(plan.canonical_question, QUESTION_MAP.business_type);
  assert(plan.reason.length > 0);
});

test('MissingInformationDetector accepts monthly_telecom_spend_inr or overall_budget', () => {
  const schemaWithTelecom = new CustomerSchema({
    business_type: 'Clinic',
    employee_count: 5,
    num_sites: 1,
    city: 'Vijayawada',
    needs: ['Internet'],
    monthly_telecom_spend_inr: 2500,
    has_gstin: 'Y',
    has_udyam: 'N',
    max_installation_days: 3
  });
  const res1 = MissingInformationDetector.detect(schemaWithTelecom);
  assert.equal(res1.schema_complete, true);

  const schemaWithOverall = new CustomerSchema({
    business_type: 'Clinic',
    employee_count: 5,
    num_sites: 1,
    city: 'Vijayawada',
    needs: ['Internet'],
    overall_budget: 15000,
    has_gstin: 'Y',
    has_udyam: 'N',
    max_installation_days: 3
  });
  const res2 = MissingInformationDetector.detect(schemaWithOverall);
  assert.equal(res2.schema_complete, true);
});
