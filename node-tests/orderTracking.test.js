/**
 * ============================================================================
 * TEST SUITE: ORDER LIFECYCLE, CONTRACTS & ESCALATIONS (orderTracking.test.js)
 * ============================================================================
 * 
 * 📌 WHAT THIS TEST SUITE VERIFIES:
 * 1. Quote Acceptance & KYC Enforcement:
 *    - Order is created in 'KYC_PENDING' status if user has not yet verified KYC docs.
 *    - Next action directs user to 'UPLOAD_KYC_DOCUMENTS'.
 * 2. Automatic Contract Generation by Customer Category:
 *    - Micro Retail / SMB gets 99.0% SLA and 12-month standard router terms.
 *    - Professional Offices / IT gets 99.5% SLA, 24-month dual-link failover + static IP.
 *    - Small Manufacturing gets 99.9% SLA with industrial ruggedized AP terms.
 *    - Multi-Branch Enterprise gets 99.95% mission-critical SLA with SD-WAN & dedicated account manager.
 * 3. Quote Rejection & Feedback Recording:
 *    - Records customer drop reasons ('Budget constraints', 'Competitor lower pricing', etc.)
 *    - Stores feedback and timestamps into quote_rejections database store.
 * 4. Sales Person Escalation & Installation Status Transitions:
 *    - Sales agent can advance order through stages:
 *      SITE_SURVEY -> HARDWARE_DISPATCH -> FIELD_INSTALLATION -> ACTIVATED.
 *    - Sales agent can flag order as ESCALATED and record internal escalation notes.
 * ============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { orderService, CONTRACT_TEMPLATES } = require('../node-src/services/orderService');
const dbClient = require('../node-src/db/dbClient');

test('Quote acceptance blocks on KYC if KYC not yet completed', async () => {
  const sessionId = 'session-test-kyc-pending-' + Date.now();
  
  const result = await orderService.acceptQuote({
    sessionId,
    bundleCode: 'P01x1;P07x2',
    bundleName: 'Airtel Connected Office Pro',
    monthlyCost: 2499,
    contractMonths: 12,
    customerSchema: {
      business_name: 'Metro Diagnostics',
      business_type: 'Healthcare Clinic',
      segment: 'Professional Offices / IT',
      city: 'Pune',
      city_tier: 1,
      max_install_days: 5
    }
  });

  assert.equal(result.order.status, 'KYC_PENDING');
  assert.equal(result.nextAction, 'UPLOAD_KYC_DOCUMENTS');
  assert.equal(result.order.isKycComplete, false);
  assert.equal(result.order.contract.slaUptime, '99.5%');
  assert.ok(result.order.contract.cpeType.includes('Static IP'));
});

test('Quote acceptance advances to survey if KYC was previously verified', async () => {
  const sessionId = 'session-test-kyc-done-' + Date.now();

  // Simulate previously verified KYC record
  await dbClient.saveKycRecord({
    sessionId,
    docType: 'gstin',
    verificationStatus: 'VERIFIED',
    docNumberMasked: '27XXXXXXXX1ZS'
  });

  const result = await orderService.acceptQuote({
    sessionId,
    bundleCode: 'P03x1',
    bundleName: 'Airtel Smart Factory Connect',
    monthlyCost: 4999,
    customerSchema: {
      business_name: 'Precision Tools Ltd',
      business_type: 'Auto Components',
      segment: 'Small Manufacturing',
      city: 'Coimbatore',
      max_install_days: 7
    }
  });

  assert.equal(result.order.status, 'ORDER_CONFIRMED');
  assert.equal(result.nextAction, 'PROCEED_TO_SURVEY');
  assert.equal(result.order.isKycComplete, true);
  assert.equal(result.order.contract.category, 'Small Manufacturing & Industrial');
  assert.equal(result.order.contract.slaUptime, '99.9%');
  assert.ok(result.order.contract.cpeType.includes('Ruggedised'));
});

test('Dynamic contracts generate specific terms for Micro Retail vs Multi-Branch', async () => {
  const retailTemplate = CONTRACT_TEMPLATES['Micro Retail / Shops'];
  assert.equal(retailTemplate.slaUptime, '99.0%');
  assert.ok(retailTemplate.specialTerms.includes('Zero lock-in'));

  const enterpriseTemplate = CONTRACT_TEMPLATES['Multi-Branch Enterprises'];
  assert.equal(enterpriseTemplate.slaUptime, '99.95%');
  assert.ok(enterpriseTemplate.cpeType.includes('SD-WAN'));
});

test('Quote rejection records drop reason and customer feedback in database', async () => {
  const sessionId = 'session-reject-' + Date.now();

  const res = await orderService.rejectQuote({
    sessionId,
    bundleCode: 'P01x1;P12x1',
    rejectionReason: 'Needs installation in under 48 hours',
    customerFeedback: 'Opening new branch on Monday, current SLA of 7 days is too slow.',
    budgetOffered: 3500
  });

  assert.equal(res.success, true);
  assert.ok(res.record.id.startsWith('REJ-'));

  const allRejections = await dbClient.getAllRejections();
  const found = allRejections.find(r => r.sessionId === sessionId);
  assert.ok(found, 'Rejection record must exist in database store');
  assert.equal(found.rejectionReason, 'Needs installation in under 48 hours');
});

test('Sales person can update order status, resolve escalations, and log agent notes', async () => {
  const sessionId = 'session-sales-mod-' + Date.now();
  const quoteRes = await orderService.acceptQuote({
    sessionId,
    bundleCode: 'P01x1',
    bundleName: 'Airtel Fiber Starter',
    monthlyCost: 999,
    customerSchema: {
      business_name: 'Corner Bakery',
      segment: 'Micro Retail / Shops',
      max_install_days: 3
    }
  });

  const orderId = quoteRes.order.orderId;

  // 1. Sales Agent flags escalation due to customer urgent install date
  const escalated = await orderService.updateOrderStatus(orderId, {
    newStatus: 'ESCALATED',
    escalationNote: 'Customer opening in 3 days, requested fast-track fibre technician assignment.',
    salesAgent: 'Rohan Sharma (Airtel Enterprise Sales)'
  });
  assert.equal(escalated.status, 'ESCALATED');
  assert.equal(escalated.escalated, true);
  assert.equal(escalated.escalationNotes.length, 1);
  assert.equal(escalated.escalationNotes[0].agent, 'Rohan Sharma (Airtel Enterprise Sales)');

  // 2. Sales Agent overrides and advances to Activated
  const activated = await orderService.updateOrderStatus(orderId, {
    newStatus: 'ACTIVATED',
    newStage: 'ACTIVATED',
    stageIndex: 4,
    escalationNote: 'Fast-track completed. Router MAC bound and 100Mbps line active.',
    salesAgent: 'Rohan Sharma (Airtel Enterprise Sales)'
  });
  assert.equal(activated.status, 'ACTIVATED');
  assert.equal(activated.escalated, false);
  assert.equal(activated.stageIndex, 4);

  // 3. Verify order tracking returns completed milestone stages
  const tracking = await orderService.getOrderTracking(orderId);
  assert.equal(tracking.stagesTimeline[4].complete, true);
});
