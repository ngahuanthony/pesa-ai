const db = require("../db");
const auth = require("../auth");
const mpesa = require("../mpesa");
const whatsapp = require("../whatsapp");

function customerStatusMessage(order) {
  const reference = order.id.slice(0, 8).toUpperCase();
  const location = order.serviceLocationSnapshot ? `\n${order.serviceLocationSnapshot.kind}: ${order.serviceLocationSnapshot.label}` : "";
  const status = String(order.fulfillmentStatus || order.status || "").toUpperCase();
  const messages = {
    ACCEPTED: `✅ Order #${reference} has been accepted.${location}\nWe will begin preparing it shortly.`,
    PREPARING: `👨‍🍳 Order #${reference} is now being prepared.${location}`,
    READY: `🔔 Order #${reference} is ready.${location}`,
    SERVED: `🍽️ Order #${reference} has been served.${location}`,
    COMPLETED: `✅ Order #${reference} is complete. Thank you!`,
    CANCELLED: `❌ Order #${reference} was cancelled. Please contact the business if you need help.`,
  };
  return messages[status] || null;
}

async function notifyCustomer(order, text) {
  if (!text) return false;
  const business = db.getBusiness(order.businessId);
  const customer = db.listOrders(order.businessId).find((candidate) => candidate.id === order.id);
  const token = whatsapp.resolveAccessToken(business);
  if (!business.whatsappPhoneNumberId || !customer?.customerPhone || !token) return false;
  return whatsapp.sendMessage(business.whatsappPhoneNumberId, customer.customerPhone, text, token);
}

function list({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId);
  return db.listOrders(params.businessId);
}

async function updateStatus({ params, body, session }) {
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
    if (next === "CANCELLED" && order.paymentStatus === "PAID") {
      throw db.httpError(409, "Paid orders cannot be cancelled until the payment has been refunded and reconciled");
    }
    const transitions = {
      NEW: ["ACCEPTED", "CANCELLED"],
      ACCEPTED: ["PREPARING", "CANCELLED"],
      PREPARING: ["READY", "CANCELLED"],
      READY: ["SERVED", "CANCELLED"],
      SERVED: ["COMPLETED"],
      COMPLETED: [],
      CANCELLED: [],
    };
    if (next === "CANCELLED" && current !== "COMPLETED" && current !== "CANCELLED") {
      const updated = db.updateOrderStatus(params.orderId, next, null, { actor: session.accountId || "merchant" });
      await notifyCustomer(updated, customerStatusMessage(updated)).catch((error) => console.warn("[orders] Customer cancellation notification failed:", error.message));
      return updated;
    }
    if (!transitions[current] || !transitions[current].includes(next)) {
      throw db.httpError(400, `Invalid fulfillment transition from ${current} to ${next}`);
    }
    const updated = db.updateOrderStatus(params.orderId, next, null, { actor: session.accountId || "merchant" });
    await notifyCustomer(updated, customerStatusMessage(updated)).catch((error) => console.warn("[orders] Customer status notification failed:", error.message));
    return updated;
  }
  const updated = db.updateOrderStatus(params.orderId, body.status, null, { actor: session.accountId || "merchant" });
  await notifyCustomer(updated, customerStatusMessage(updated)).catch((error) => console.warn("[orders] Customer status notification failed:", error.message));
  return updated;
}

async function updateItems({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const existing = db.getOrder(params.orderId);
  if (!existing || existing.businessId !== params.businessId) throw db.httpError(404, "Order not found");
  const updated = db.updateOrderItems(params.orderId, body && body.items, { actor: session.accountId || "merchant" });
  const lines = updated.items.map((item) => `${item.quantity}× ${item.productName}`).join("\n");
  const message = `✏️ Order #${updated.id.slice(0, 8).toUpperCase()} was updated:\n${lines}\nNew total: KSh ${Number(updated.totalAmount).toLocaleString("en-KE")}`;
  await notifyCustomer(updated, message).catch((error) => console.warn("[orders] Customer correction notification failed:", error.message));
  return updated;
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
  const updated = db.updateOrderStatus(params.orderId, "paid", {
    paymentMethod: "manual",
    paymentRef:    paymentRef || null,
  }, { actor: session.accountId || "merchant" });
  db.recordSaleForOrder(updated, { paymentMethod: "manual", mpesaTxnId: paymentRef || null });
  notifyCustomer(updated, `✅ Payment received for order #${updated.id.slice(0, 8).toUpperCase()}.\nAmount: KSh ${Number(updated.totalAmount).toLocaleString("en-KE")}${paymentRef ? `\nRef: ${paymentRef}` : ""}`).catch((error) => console.warn("[orders] Customer payment notification failed:", error.message));
  return updated;
}

module.exports = { list, updateStatus, updateItems, payWithMpesa, markPaid };
