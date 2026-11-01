/**
 * ============================================================================
 * AIRTEL BUSINESS ORDER, CONTRACT & INSTALLATION TRACKING SERVICE (orderService.js)
 * ============================================================================
 * 
 * 📌 WHAT THIS FILE DOES (BEGINNER-FRIENDLY GUIDE):
 * Once customer discovery recommends bundles, the sales journey progresses through:
 * 
 * 1. 🤝 QUOTE ACCEPTANCE & KYC GATEWAY:
 *    - When the customer accepts a recommended bundle, the system checks whether
 *      statutory KYC (GSTIN / Udyam / Aadhaar / Voter ID) has been completed.
 *    - If KYC is NOT yet completed, the order is placed in `KYC_PENDING` status,
 *      and the user is prompted to complete document upload.
 *    - Once verified, the order moves to `ORDER_CONFIRMED`.
 * 
 * 2. ❌ QUOTE REJECTION & DROP-REASON TRACKING:
 *    - If a quote is declined, the customer is asked for the reason (e.g. Budget,
 *      Competitor pricing, Installation speed).
 *    - The drop reason and feedback are permanently logged to the database
 *      (`quote_rejections`) for sales pipeline analytics.
 * 
 * 3. 📜 CATEGORY-DEPENDENT CONTRACT GENERATION:
 *    - Automatically drafts a binding legal Airtel SLA contract based on customer category:
 *      * Micro Retail: 99.0% uptime SLA, 12-month term, flexible termination.
 *      * Professional Offices / IT: 99.5% uptime SLA, 12-24 mo term, Static IP included.
 *      * Small Manufacturing: 99.9% uptime SLA, 24 mo term, Rugged APs & IoT integration.
 *      * Multi-Branch Enterprise: 99.95% mission-critical SLA, 36 mo term, SD-WAN & dedicated account manager.
 * 
 * 4. 🚚 LIVE DUAL-VIEW INSTALLATION TRACKER & SALES ESCALATIONS:
 *    - 5 Real-world milestone stages:
 *      1) ORDER_CONFIRMED -> 2) SITE_SURVEY -> 3) HARDWARE_DISPATCH ->
 *      4) INSTALLATION_TESTING -> 5) ACTIVATED.
 *    - Countdown tracker based on user's `max_install_days`.
 *    - Sales Escalations: Flags orders with KYC issues or installation roadblocks so
 *      sales agents can intervene, review documents, and override statuses.
 * ============================================================================
 */

const crypto = require('crypto');
const dbClient = require('../db/dbClient');

// Standard Customer Segments & Corresponding Contract Templates
const CONTRACT_TEMPLATES = {
  'Micro Retail / Shops': {
    category: 'Micro Retail',
    slaUptime: '99.0%',
    defaultMonths: 12,
    cpeType: 'Airtel Standard Dual-Band Wi-Fi 6 Router',
    supportLevel: 'Standard 24x7 Digital Helpdesk (4-hour resolution SLA)',
    specialTerms: 'Zero lock-in option after 6 months; prepaid or postpaid billing.'
  },
  'Professional Offices / IT': {
    category: 'Professional Office & Healthcare',
    slaUptime: '99.5%',
    defaultMonths: 24,
    cpeType: 'Airtel Business Enterprise Gateway + 1 Static IP Subnet',
    supportLevel: 'Priority Enterprise Support (2-hour resolution SLA)',
    specialTerms: 'Dual-link failover capability; free static IP renewal with contract.'
  },
  'Small Manufacturing': {
    category: 'Small Manufacturing & Industrial',
    slaUptime: '99.9%',
    defaultMonths: 24,
    cpeType: 'Industrial Ruggedised Outdoor Access Points + Machine SIM Pool',
    supportLevel: 'Dedicated Field Engineer & On-Site Escalation Manager',
    specialTerms: 'Factory-floor dust/temperature certified hardware; scheduled maintenance window.'
  },
  'Multi-Branch Enterprises': {
    category: 'Multi-Branch & Retail Chains',
    slaUptime: '99.95%',
    defaultMonths: 36,
    cpeType: 'Airtel Managed SD-WAN Controller + MPLS Redundancy',
    supportLevel: 'Dedicated Technical Account Manager (TAM) & 15-minute phone response',
    specialTerms: 'Centralised cloud firewall orchestration; multi-branch single consolidated invoice.'
  }
};

class OrderService {
  /**
   * Accepts a bundle quote and initiates the order lifecycle
   * Enforces KYC verification check.
   */
  async acceptQuote({ sessionId, bundleCode, bundleName, monthlyCost, contractMonths, customerSchema = {} }) {
    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();

    // Check if KYC has already been verified for this session
    const kycRecords = await dbClient.getKycRecordsBySession(sessionId);
    const isKycComplete = kycRecords.some(r => r.verificationStatus === 'VERIFIED');

    // Determine customer category contract template
    const segment = customerSchema.segment || 'Professional Offices / IT';
    const template = CONTRACT_TEMPLATES[segment] || CONTRACT_TEMPLATES['Professional Offices / IT'];

    const installDaysRequested = customerSchema.max_install_days || 7;
    const targetDate = new Date(Date.now() + installDaysRequested * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const orderRecord = {
      orderId,
      sessionId,
      userId: customerSchema.business_name || sessionId,
      customerName: customerSchema.business_name || 'Valued Airtel SMB Customer',
      businessType: customerSchema.business_type || 'SMB',
      city: customerSchema.city || 'National',
      cityTier: customerSchema.city_tier || 'Tier 2',
      bundleCode,
      bundleName,
      monthlyCostInr: monthlyCost || 1999,
      contractMonths: contractMonths || template.defaultMonths,
      status: isKycComplete ? 'ORDER_CONFIRMED' : 'KYC_PENDING',
      installationStage: isKycComplete ? 'SITE_SURVEY_SCHEDULED' : 'PENDING_DOCUMENT_VERIFICATION',
      stageIndex: isKycComplete ? 1 : 0,
      maxInstallDays: installDaysRequested,
      targetCompletionDate: targetDate,
      isKycComplete,
      escalated: false,
      escalationReason: null,
      escalationNotes: [],
      contract: {
        contractId: 'CNT-' + orderId.slice(4),
        category: template.category,
        slaUptime: template.slaUptime,
        cpeType: template.cpeType,
        supportLevel: template.supportLevel,
        specialTerms: template.specialTerms,
        generatedAt: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store order record
    await dbClient.saveOrder(orderRecord);

    return {
      order: orderRecord,
      nextAction: isKycComplete ? 'PROCEED_TO_SURVEY' : 'UPLOAD_KYC_DOCUMENTS',
      message: isKycComplete
        ? `Quote accepted! Your installation has been scheduled to complete within ${installDaysRequested} days.`
        : 'Quote accepted! Please complete secure KYC verification (Aadhaar, Voter ID, GSTIN, or Udyam) to schedule engineer dispatch.'
    };
  }

  /**
   * Captures customer rejection reasons and records feedback in DB
   */
  async rejectQuote({ sessionId, bundleCode, rejectionReason, customerFeedback, budgetOffered }) {
    const rejectionRecord = {
      id: 'REJ-' + Date.now().toString(36).toUpperCase(),
      sessionId,
      bundleCode,
      rejectionReason: rejectionReason || 'Budget constraints',
      customerFeedback: customerFeedback || '',
      budgetOffered: budgetOffered || null,
      createdAt: new Date().toISOString()
    };

    await dbClient.saveQuoteRejection(rejectionRecord);

    return {
      success: true,
      message: 'Thank you for your valuable feedback. Our sales team has noted your requirements and will reach out with customized options.',
      record: rejectionRecord
    };
  }

  /**
   * Advances or modifies an order's installation status (used by Sales Person / Techs)
   */
  async updateOrderStatus(orderId, { newStatus, newStage, stageIndex, escalationNote, salesAgent = 'Sales Ops' }) {
    const order = await dbClient.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    if (newStatus) order.status = newStatus;
    if (newStage) order.installationStage = newStage;
    if (typeof stageIndex === 'number') order.stageIndex = stageIndex;

    // Handle escalation flag
    if (newStatus === 'ESCALATED') {
      order.escalated = true;
      order.escalationReason = escalationNote || 'Flagged for sales escalation review';
    } else if (newStatus === 'ACTIVATED' || newStatus === 'ORDER_CONFIRMED') {
      order.escalated = false;
    }

    if (escalationNote) {
      order.escalationNotes.push({
        agent: salesAgent,
        note: escalationNote,
        timestamp: new Date().toISOString()
      });
    }

    order.updatedAt = new Date().toISOString();
    await dbClient.saveOrder(order);

    return order;
  }

  /**
   * Retrieves live tracking details for a customer order
   */
  async getOrderTracking(orderId) {
    const order = await dbClient.getOrderById(orderId);
    if (!order) return null;

    const stages = [
      { id: 'KYC_VERIFICATION', label: '1. KYC & Statutory Verification', complete: order.isKycComplete },
      { id: 'SITE_SURVEY', label: '2. Site Survey & Fibre Feasibility', complete: order.stageIndex >= 1 },
      { id: 'HARDWARE_DISPATCH', label: '3. CPE Router & Fibre Dispatch', complete: order.stageIndex >= 2 },
      { id: 'FIELD_INSTALLATION', label: '4. Physical Cabling & Testing', complete: order.stageIndex >= 3 },
      { id: 'ACTIVATION_LIVE', label: '5. Airtel Live Activation', complete: order.stageIndex >= 4 || order.status === 'ACTIVATED' }
    ];

    return {
      ...order,
      stagesTimeline: stages
    };
  }

  /**
   * Retrieves all orders for a session
   */
  async getOrdersBySession(sessionId) {
    return await dbClient.getOrdersBySession(sessionId);
  }

  /**
   * Retrieves all escalated orders and recent orders for the Sales Person Dashboard
   */
  async getSalesDashboardData() {
    const orders = await dbClient.getAllOrders();
    const rejections = await dbClient.getAllRejections();
    const kycVerifications = await dbClient.getAllKycRecords();

    const escalatedOrders = orders.filter(o => o.escalated || o.status === 'ESCALATED' || o.status === 'KYC_PENDING');
    const activeInstallations = orders.filter(o => o.status !== 'ACTIVATED');
    const completedActivations = orders.filter(o => o.status === 'ACTIVATED');

    return {
      stats: {
        totalOrders: orders.length,
        escalatedCount: escalatedOrders.length,
        activeInstallationsCount: activeInstallations.length,
        completedActivationsCount: completedActivations.length,
        totalRejectionsCount: rejections.length,
        totalKycVerifiedCount: kycVerifications.filter(k => k.verificationStatus === 'VERIFIED').length
      },
      escalations: escalatedOrders,
      allOrders: orders,
      recentRejections: rejections.slice(-10).reverse(),
      recentKyc: kycVerifications.slice(-10).reverse()
    };
  }
}

const orderService = new OrderService();

module.exports = {
  OrderService,
  orderService,
  CONTRACT_TEMPLATES
};
