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

// POST /api/businesses/:businessId/orders/:orderId/mark-paid
// Manual "I received this payment" for bank transfers or undetected paybill
// payments. Vendors use this from the Orders tab when they confirm money
// arrived in their bank / M-Pesa statement but the system didn't auto-detect it.
function markPaid({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const order = db.getOrder(params.orderId);
  if (!order || order.businessId !== params.businessId) throw db.httpError(404, "Order not found");
  if (order.status === "paid" || order.status === "fulfilled") {
    throw db.httpError(400, "Order is already paid or fulfilled");
  }
  const updated = db.updateOrderStatus(params.orderId, "paid");
  const note = (body && body.note) ? String(body.note).trim() : null;
  if (note) {
    // Attach an optional vendor note (e.g. "Bank ref: ABC123")
    db.mutate((state) => {
      const o = (state.orders || []).find((x) => x.id === params.orderId);
      if (o) o.paymentNote = note;
    });
  }
  return updated;
}

module.exports = { list, updateStatus, payWithMpesa, markPaid };
