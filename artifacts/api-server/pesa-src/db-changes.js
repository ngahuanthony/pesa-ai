/*
  CHANGES FOR: server/src/db.js
  ---------------------------------------------------------------
  I don't have your actual db.js source (GitHub blocked me from
  reading file contents directly), so this is written to match
  the JSON-file data layer described in your README. Adjust
  variable/function names to match your real file — the shape
  and logic are what matters.
*/

// ── 1. BUSINESS SCHEMA — add these OPTIONAL fields wherever a
//    new business object is created (e.g. inside createBusiness()) ──

function createBusiness(data) {
  return {
    id: generateId(),
    name: data.name,
    category: data.category,
    owner: data.owner,
    paybillOrBankAccount: data.paybillOrBankAccount, // existing, required

    // NEW — optional trust fields
    buildingName: data.buildingName || null,
    shopNumber: data.shopNumber || null,
    publicPhone: data.publicPhone || null,

    // NEW — private, internal-only. NEVER return this field from any
    // public-facing route (landing, catalog, chat, customer-facing admin views).
    idOrKraPin: data.idOrKraPin || null,

    // NEW — becomes true only via manual admin review, not just because
    // buildingName/shopNumber are filled in
    verifiedShop: false,

    createdAt: new Date().toISOString(),
    trialEndsAt: addDays(new Date(), 14).toISOString(),
    // ...keep the rest of your existing fields here
  };
}

// Helper to strip private fields before sending a business object
// to any public/customer-facing response.
function toPublicBusiness(business) {
  const { idOrKraPin, ...publicFields } = business;
  return publicFields;
}

// ── 2. REPORTS COLLECTION — new file/collection, e.g. data/reports.json ──

function createReport({ businessId, reporterContact, reason, details }) {
  const report = {
    id: generateId(),
    businessId,
    reporterContact: reporterContact || null, // optional, for follow-up only
    reason, // one of: 'scam' | 'no_delivery' | 'wrong_product' | 'other'
    details: details || '',
    status: 'open', // 'open' | 'reviewed' | 'dismissed'
    createdAt: new Date().toISOString(),
  };
  const reports = readReports(); // load from data/reports.json
  reports.push(report);
  writeReports(reports);
  return report;
}

function getReportsGroupedByBusiness() {
  const reports = readReports();
  const businesses = readBusinesses();

  const counts = {};
  for (const r of reports) {
    if (!counts[r.businessId]) counts[r.businessId] = [];
    counts[r.businessId].push(r);
  }

  return Object.entries(counts)
    .map(([businessId, reportsForBusiness]) => ({
      business: businesses.find((b) => b.id === businessId) || null,
      openCount: reportsForBusiness.filter((r) => r.status === 'open').length,
      reports: reportsForBusiness,
    }))
    .sort((a, b) => b.openCount - a.openCount); // worst offenders first
}

function updateReportStatus(reportId, status) {
  const reports = readReports();
  const report = reports.find((r) => r.id === reportId);
  if (!report) return null;
  report.status = status; // admin sets this manually — never automatic
  writeReports(reports);
  return report;
}

// NOTE: nowhere in this file does a report change paybillOrBankAccount,
// trigger a payout hold, or touch the M-Pesa/mpesa.js flow. Reports and
// trust fields are informational/moderation only, per your instruction
// that funds always go straight to the business's own paybill/account.

module.exports = {
  createBusiness,
  toPublicBusiness,
  createReport,
  getReportsGroupedByBusiness,
  updateReportStatus,
};
