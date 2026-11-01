const test = require('node:test');
const assert = require('node:assert/strict');
const CustomerSchema = require('../node-src/models/customerSchema');

test('CustomerSchema defaults to null for unknown fields and empty array for needs', () => {
  const schema = new CustomerSchema();
  assert.equal(schema.business_name, null);
  assert.equal(schema.business_type, null);
  assert.equal(schema.employee_count, null);
  assert.equal(schema.num_sites, null);
  assert.equal(schema.city, null);
  assert.equal(schema.budget, null);
  assert.deepEqual(schema.needs, []);
  assert(Array.isArray(schema.needs));
});

test('CustomerSchema coerces numeric strings properly', () => {
  const schema = new CustomerSchema({
    employee_count: '25 employees',
    num_sites: '3 branches',
    budget: '₹4500 per month'
  });
  assert.equal(schema.employee_count, 25);
  assert.equal(schema.num_sites, 3);
  assert.equal(schema.budget, 4500);
});

test('CustomerSchema mergeUpdates does not overwrite valid values with null or empty', () => {
  const schema = new CustomerSchema({
    business_type: 'Restaurant',
    city: 'Hyderabad',
    employee_count: 20
  });

  schema.mergeUpdates({
    city: null,
    employee_count: '',
    budget: 3000,
    needs: ['High speed WiFi']
  });

  assert.equal(schema.business_type, 'Restaurant');
  assert.equal(schema.city, 'Hyderabad');
  assert.equal(schema.employee_count, 20);
  assert.equal(schema.budget, 3000);
  assert.deepEqual(schema.needs, ['High speed WiFi']);
});

test('CustomerSchema correctly handles monthly_telecom_spend_inr and overall_budget independently', () => {
  const schema = new CustomerSchema({
    monthly_telecom_spend_inr: '₹1800/mo',
    overall_budget: '₹15000'
  });
  assert.equal(schema.monthly_telecom_spend_inr, 1800);
  assert.equal(schema.overall_budget, 15000);

  const json = schema.toJSON();
  assert.equal(json.monthly_telecom_spend_inr, 1800);
  assert.equal(json.overall_budget, 15000);
});
