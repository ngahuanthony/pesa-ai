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
  db.getBusiness(params.businessId);
  const subscription = db.getSubscription(params.businessId);
  if (!db.planHasFeature(subscription.plan, "mpesa")) throw db.httpError(402, "M-Pesa integration is available on the Business plan and above — switch plans in the Billing tab to connect your paybill.");
  if (!cryptoUtil.isConfigured()) throw db.httpError(503, "M-Pesa credential storage isn't configured on this server yet (ENCRYPTION_KEY is missing).");
  const input = body || {};
  const method = input.method || "paybill";
  const shortcode = String(input.tillNumber || input.paybillNumber || process.env.DARAJA_SHORTCODE || "").trim();
  const sandbox = (process.env.DARAJA_ENV || process.env.MPESA_ENV) === "sandbox";
  const consumerKey = input.consumerKey || (sandbox ? process.env.DARAJA_CONSUMER_KEY : null);
  const consumerSecret = input.consumerSecret || (sandbox ? process.env.DARAJA_CONSUMER_SECRET : null);
  const passkey = input.passkey || (sandbox ? process.env.DARAJA_PASSKEY : null);
  if (!consumerKey || !consumerSecret || !passkey || !shortcode) throw db.httpError(400, "M-Pesa number is required; sandbox Daraja credentials must be configured on the server");
  if (!["till", "paybill", "paybill_account"].includes(method)) throw db.httpError(400, "method must be till, paybill, or paybill_account");
  const accountMode = input.accountMode === "dynamic_customer_phone" ? "dynamic_customer_phone" : "static";
  const actor = session.accountId || "vendor";
  return { status: 201, data: db.setMpesaCredentials(params.businessId, { consumerKey, consumerSecret, passkey, shortcode, method, tillNumber: method === "till" ? shortcode : null, paybillNumber: method === "till" ? null : shortcode, accountNumber: accountMode === "static" ? input.accountNumber : null, accountMode }, actor) };
}
function disconnect({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const actor = session.accountId || "admin";
  return db.clearMpesaCredentials(params.businessId, actor);
}

module.exports = { status, connect, disconnect };
