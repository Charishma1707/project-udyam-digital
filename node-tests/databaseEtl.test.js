const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const { runEtl } = require('../node-src/db/preprocessAndLoad');
const dbClient = require('../node-src/db/dbClient');

describe('Database ETL and Registry Lookup Tests', () => {
  before(async () => {
    await runEtl();
  });

  test('ETL loads all datasets into persistent memoryStore with exact counts', async () => {
    assert.strictEqual(dbClient.memoryStore.products.size, 25, 'Should load 25 products');
    assert.strictEqual(dbClient.memoryStore.gstin.size, 3534, 'Should load 3534 GSTINs');
    assert.strictEqual(dbClient.memoryStore.udyam.size, 2723, 'Should load 2723 Udyam registrations');
    assert.strictEqual(dbClient.memoryStore.leads.size, 5000, 'Should load 5000 SMB leads');
  });

  test('findGstin retrieves active GSTIN entity correctly', async () => {
    const record = await dbClient.findGstin('32TTNXB7384T1ZW');
    assert.ok(record, 'Record should exist');
    assert.strictEqual(record.legal_name, 'Balaji Dental Care LLP');
    assert.strictEqual(record.state, 'Kerala');
    assert.strictEqual(record.status, 'Active');
  });

  test('findUdyam retrieves enterprise details correctly', async () => {
    const record = await dbClient.findUdyam('UDYAM-KL-00-3078801');
    assert.ok(record, 'Record should exist');
    assert.strictEqual(record.enterprise_name, 'Balaji Dental Care LLP');
    assert.strictEqual(record.enterprise_type, 'Micro');
    assert.strictEqual(record.city, 'Kochi');
  });

  test('getProducts returns all 25 catalogue products with sanitized numeric types', async () => {
    const products = await dbClient.getProducts();
    assert.strictEqual(products.length, 25);
    const p1 = products.find((p) => p.product_id === 'P01');
    assert.ok(p1);
    assert.strictEqual(p1.product_name, 'Biz Fibre 100');
    assert.strictEqual(typeof p1.price_min_inr_per_month, 'number');
    assert.strictEqual(p1.price_min_inr_per_month, 999);
  });

  test('getLeadById retrieves historical lead record correctly', async () => {
    const lead = await dbClient.getLeadById('L00001');
    assert.ok(lead);
    assert.strictEqual(lead.business_name, 'Balaji Dental Care LLP');
    assert.strictEqual(lead.business_type, 'Dental clinic');
    assert.strictEqual(lead.city, 'Kochi');
  });
});
