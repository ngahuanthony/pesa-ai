const db = require("../db");
const auth = require("../auth");
const mpesa = require("../mpesa");

async function stkPush({ body, session }) {
  const { businessId, orderId, phone } = body || {};
  if (!businessId || !orderId || !phone) throw db.httpError(400, "businessId, orderId and phone are required");
  auth.requireOwnBusiness(session, businessId);
  const order = db.getOrder(orderId);
  if (!order || order.businessId !== businessId) throw db.httpError(404, "Order not found");
  return mpesa.initiateStkPush({ orderId, phone });
}

async function callback({ body }) {
  await mpesa.handleStkCallback(body || {});
  return { ok: true };
}

module.exports = { stkPush, callback };
