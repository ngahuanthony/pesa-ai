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
  const allowed = ["pending", "confirmed", "paid", "fulfilled", "cancelled", "NEW", "ACCEPTED", "PREPARING", "READY", "SERVED", "COMPLETED", "CANCELLED"];
  if (!allowed.includes(body.status)) {
    throw db.httpError(400, `status must be one of: ${allowed.join(", ")}`);
  }
  const order = db.getOrder(params.orderId);
  if (!order || order.businessId !== params.businessId) throw db.httpError(404, "Order not found");
  if (order.fulfillmentStatus) {
    const next = String(body.status).toUpperCase();
    const current = String(order.fulfillmentStatus).toUpperCase();
    const transitions = {
      NEW: ["ACCEPTED", "CANCELLED"],
      ACCEPTED: ["PREPARING", "CANCELLED"],
      PREPARING: ["READY", "CANCELLED"],
      READY: ["SERVED", "CANCELLED"],
      SERVED: ["COMPLETED"],
      COMPLETED: [],
      CANCELLED: [],
    };
    if (next === "CANCELLED" && current !== "COMPLETED" && current !== "CANCELLED") return db.updateOrderStatus(params.orderId, next);
    if (!transitions[current] || !transitions[current].includes(next)) {
      throw db.httpError(400, `Invalid fulfillment transition from ${current} to ${next}`);
    }
    return db.updateOrderStatus(params.orderId, next);
  }
  return db.updateOrderStatus(params.orderId, body.status);
}

async function payWithMpesa({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const order = db.getOrder(params.orderId);
  if (!order || order.businessId !== params.businessId) throw db.httpError(404, "Order not found");
  return mpesa.initiateStkPush({ orderId: params.orderId, phone: body.phone });
}

// POST /api/businesses/:businessId/orders/:orderId/mark-paid
// Manual "I received this payment" for bank transfers or undetected paybill
// payments. Vendors use this from the Orders tab when they confirm money
// arrived in their bank / M-Pesa statement but the system didn't auto-detect it.
function markPaid({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const order = db.getOrder(params.orderId);
  if (!order || order.businessId !== params.businessId) throw db.httpError(404, "Order not found");
  if (order.paymentStatus === "PAID" || order.status === "paid" || order.status === "fulfilled") {
    throw db.httpError(400, "Order is already paid or fulfilled");
  }
  const paymentRef = (body && body.paymentRef) ? String(body.paymentRef).trim() : null;
  return db.updateOrderStatus(params.orderId, "paid", {
    paymentMethod: "manual",
    paymentRef:    paymentRef || null,
  });
}

module.exports = { list, updateStatus, payWithMpesa, markPaid };
