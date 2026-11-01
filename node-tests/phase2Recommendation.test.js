const test = require('node:test');
const assert = require('node:assert/strict');
const CustomerSchema = require('../node-src/models/customerSchema');
const { targetSegmentService } = require('../node-src/services/targetSegmentService');
const { recommendationEngine } = require('../node-src/services/recommendationEngine');
const { CANONICAL_SEGMENTS } = require('../preprocessing/normalize-segments');

test('TargetSegmentService deterministically maps known business types to canonical segments', async () => {
  const allowed = Object.values(CANONICAL_SEGMENTS);

  // Exact matches
  const r1 = await targetSegmentService.resolveSegment('Restaurant');
  assert.equal(r1.segment, 'Micro Retail & Services');
  assert.equal(r1.method, 'exact');
  assert(allowed.includes(r1.segment));

  const r2 = await targetSegmentService.resolveSegment('CA Firm');
  assert.equal(r2.segment, 'Professional Offices');
  assert(allowed.includes(r2.segment));

  const r3 = await targetSegmentService.resolveSegment('Textile Unit');
  assert.equal(r3.segment, 'Small Manufacturing');
  assert(allowed.includes(r3.segment));
});

test('TargetSegmentService resolves variations (Bakery Hill, ABC Bakery) via fuzzy / keyword matching', async () => {
  const allowed = Object.values(CANONICAL_SEGMENTS);

  // "Bakery Hill" should match "bakery"
  const r1 = await targetSegmentService.resolveSegment('Bakery Hill');
  assert.equal(r1.segment, 'Micro Retail & Services');
  assert(['keyword', 'fuzzy'].includes(r1.method));
  assert(allowed.includes(r1.segment));

  // "Sri Lakshmi Cafe" should match "cafe"
  const r2 = await targetSegmentService.resolveSegment('Sri Lakshmi Cafe');
  assert.equal(r2.segment, 'Micro Retail & Services');
  assert(['keyword', 'fuzzy'].includes(r2.method));
  assert(allowed.includes(r2.segment));

  // "Dental Care Clinic" should match dental clinic / clinic
  const r3 = await targetSegmentService.resolveSegment('Dental Care Clinic');
  assert.equal(r3.segment, 'Professional Offices');
  assert(allowed.includes(r3.segment));
});

test('RecommendationEngine generates 3 tailored bundles for verified customer', async () => {
  const schema = new CustomerSchema({
    business_name: 'Lakshmi Sweets & Bakery',
    business_type: 'Bakery',
    employee_count: 12,
    num_sites: 1,
    city: 'Hyderabad',
    city_tier: 1,
    needs: ['WiFi', 'CCTV'],
    monthly_telecom_spend_inr: 3500,
    has_gstin: 'Y',
    has_udyam: 'Y',
    max_installation_days: 7
  });

  const recs = await recommendationEngine.generateRecommendations(schema);

  assert.equal(recs.customer_summary.target_segment, 'Micro Retail & Services');
  assert.equal(recs.customer_summary.has_gstin, true);
  assert.equal(recs.customer_summary.has_udyam, true);

  // 3 distinct bundles must be present
  assert.equal(recs.recommended_bundles.length, 3);
  const [primary, budget, fast] = recs.recommended_bundles;

  assert(primary.bundle_name.includes('Primary'));
  assert(primary.monthly_cost_inr > 0);
  assert(primary.estimated_install_days <= 7);
  assert(primary.products.length > 0);

  assert(budget.bundle_name.includes('Value'));
  assert(budget.monthly_cost_inr <= primary.monthly_cost_inr);

  assert(fast.bundle_name.includes('Fast-Track'));
  assert(fast.estimated_install_days <= 3);
});

test('RecommendationEngine locks enterprise products when has_gstin is N, and creates what-if unlock insight', async () => {
  const schemaNoGst = new CustomerSchema({
    business_type: 'Chartered Accountant',
    employee_count: 25,
    num_sites: 2,
    city: 'Mumbai',
    city_tier: 1,
    needs: ['Internet', 'Cloud'],
    monthly_telecom_spend_inr: 8000,
    has_gstin: 'N',
    has_udyam: 'N',
    max_installation_days: 14
  });

  const recs = await recommendationEngine.generateRecommendations(schemaNoGst);

  // High-speed enterprise leased line products requiring GSTIN should be in what_if_insights.gstin_unlocked_products
  assert(recs.what_if_insights.gstin_unlocked_products.length > 0);
  const unlockedNames = recs.what_if_insights.gstin_unlocked_products.map(p => p.product_name);
  assert(unlockedNames.some(name => name.includes('1G') || name.includes('ILL') || name.includes('Dedicated')));
});

test('RecommendationEngine calculates timeline extensions when customer specifies tight install days', async () => {
  const schemaTightTimeline = new CustomerSchema({
    business_type: 'Restaurant',
    employee_count: 10,
    num_sites: 1,
    city: 'Bengaluru',
    city_tier: 1,
    needs: ['WiFi'],
    monthly_telecom_spend_inr: 4000,
    has_gstin: 'Y',
    has_udyam: 'Y',
    max_installation_days: 2 // Very tight 2-day timeline
  });

  const recs = await recommendationEngine.generateRecommendations(schemaTightTimeline);

  // Products with typical_install_days > 2 should be in installation_timeline_extensions
  assert(recs.what_if_insights.installation_timeline_extensions.length > 0);
  const ext = recs.what_if_insights.installation_timeline_extensions[0];
  assert(ext.required_days > 2);
  assert.equal(ext.current_max_days, 2);
});
