// Merchants submit receiving details only. API secrets belong to Pesa SI admins.

const db = require("../db");
const auth = require("../auth");

function status({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId); // 404s if missing
  return db.getMpesaStatus(params.businessId);
}

async function connect({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId);
  const subscription = db.getSubscription(params.businessId);
  if (!db.planHasFeature(subscription.plan, "mpesa")) throw db.httpError(402, "M-Pesa integration is available on the Business plan and above.");
  const input = body || {};
  const method = input.method || "paybill";
  if (["consumerKey", "consumerSecret", "passkey", "shortcode"].some((key) => Object.hasOwn(input, key))) throw db.httpError(400, "Daraja credentials are managed by Pesa SI administrators");
  const shortcode = String(method === "till" ? input.tillNumber || "" : input.paybillNumber || "").trim();
  if (!["till", "paybill", "paybill_account"].includes(method)) throw db.httpError(400, "method must be till, paybill, or paybill_account");
  const accountMode = input.accountMode === "dynamic_customer_phone" ? "dynamic_customer_phone" : "static";
  const actor = session.accountId || "vendor";
  const result = db.setMpesaReceivingAccount(params.businessId, { shortcode, method, accountNumber: input.accountNumber, accountMode }, actor);
  return { status: 201, data: result };
}
function disconnect({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const actor = session.accountId || "admin";
  return db.clearMpesaCredentials(params.businessId, actor);
}

module.exports = { status, connect, disconnect };
