const db = require("../db");
const auth = require("../auth");
const mpesa = require("../mpesa");

function list({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId);
  return db.listOrders(params.businessId);
}

function updateStatus({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const allowed = ["pending", "confirmed", "paid", "fulfilled", "cancelled"];
  if (!allowed.includes(body.status)) {
    throw db.httpError(400, `status must be one of: ${allowed.join(", ")}`);
  }
  const order = db.getOrder(params.orderId);
  if (!order || order.businessId !== params.businessId) throw db.httpError(404, "Order not found");
  return db.updateOrderStatus(params.orderId, body.status);
}

async function payWithMpesa({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const order = db.getOrder(params.orderId);
  if (!order || order.businessId !== params.businessId) throw db.httpError(404, "Order not found");
  return mpesa.initiateStkPush({ orderId: params.orderId, phone: body.phone });
}

module.exports = { list, updateStatus, payWithMpesa };
