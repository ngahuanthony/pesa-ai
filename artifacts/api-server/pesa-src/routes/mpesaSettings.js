// Lets a business connect their OWN Safaricom Daraja API app (pass-through
// model — see src/mpesa.js and src/crypto.js). Deliberately separate from
// routes/business.js: these fields need different handling (write-only,
// encrypted, never echoed back) from a normal PATCH-style field update.

const db = require("../db");
const auth = require("../auth");
const cryptoUtil = require("../crypto");

function status({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId); // 404s if missing
  return db.getMpesaStatus(params.businessId);
}

function connect({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId); // 404s if missing

  const subscription = db.getSubscription(params.businessId);
  if (!db.planHasFeature(subscription.plan, "mpesa")) {
    throw db.httpError(
      402,
      "M-Pesa integration is available on the Business plan and above — switch plans in the Billing tab to connect your paybill."
    );
  }

  if (!cryptoUtil.isConfigured()) {
    throw db.httpError(
      503,
      "M-Pesa credential storage isn't configured on this server yet (ENCRYPTION_KEY is missing) — contact support before connecting a paybill."
    );
  }

  const { consumerKey, consumerSecret, passkey, shortcode } = body || {};
  if (!consumerKey || !consumerSecret || !passkey || !shortcode) {
    throw db.httpError(400, "consumerKey, consumerSecret, passkey and shortcode are all required");
  }

  const actor = session.accountId || "admin";
  return { status: 201, data: db.setMpesaCredentials(params.businessId, { consumerKey, consumerSecret, passkey, shortcode }, actor) };
}

function disconnect({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const actor = session.accountId || "admin";
  return db.clearMpesaCredentials(params.businessId, actor);
}

module.exports = { status, connect, disconnect };
