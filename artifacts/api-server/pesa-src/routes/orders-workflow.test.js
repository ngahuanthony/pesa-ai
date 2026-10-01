const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-si-orders-"));
const db = require("../db");
const mpesa = require("../mpesa");

function setupOrder() {
  const suffix = String(Math.floor(Math.random() * 900000) + 100000);
  const business = db.mutate((state) => db.createBusiness(state, {
    name: `Workflow Kitchen ${suffix}`,
    category: "Hospitality",
    merchantType: "hospitality",
    phone: `254700${suffix}`,
    personalPhone: `254711${suffix}`,
    pesaAiNumber: `254722${suffix}`,
  }));
  const location = db.createServiceLocation(business.id, { kind: "TABLE", label: "Table 7" });
  const rice = db.createProduct(business.id, { name: "Pilau", price: 350, stockQty: 10 });
  const drink = db.createProduct(business.id, { name: "Juice", price: 150, stockQty: 10 });
  const customer = db.mutate((state) => db.findOrCreateCustomer(state, business.id, "254733333333", "Amina"));
  const order = db.mutate((state) => db.createOrder(state, {
    businessId: business.id,
    customerId: customer.id,
    serviceLocationId: location.id,
    items: [{ productId: rice.id, quantity: 1 }],
  }));
  return { business, location, rice, drink, order };
}

test("order corrections recalculate totals, reserve stock, and keep history", () => {
  const { rice, drink, order } = setupOrder();
  const corrected = db.updateOrderItems(order.id, [
    { productId: rice.id, quantity: 2 },
    { productId: drink.id, quantity: 1 },
  ]);
  assert.equal(corrected.totalAmount, 850);
  assert.equal(corrected.revision, 2);
  assert.equal(corrected.history.at(-1).type, "items");
  assert.equal(db.getProduct(rice.id).stockQty, 8);
  assert.equal(db.getProduct(drink.id).stockQty, 9);
});

test("payment remains independent from kitchen fulfilment", () => {
  const { order } = setupOrder();
  const accepted = db.updateOrderStatus(order.id, "ACCEPTED");
  const paid = db.updateOrderStatus(order.id, "paid", { paymentMethod: "manual", paymentRef: "TEST-1" });
  assert.equal(accepted.fulfillmentStatus, "ACCEPTED");
  assert.equal(paid.paymentStatus, "PAID");
  assert.equal(paid.fulfillmentStatus, "ACCEPTED");
  assert.throws(() => db.updateOrderItems(order.id, [{ productId: paid.items[0].productId, quantity: 2 }]), /Paid orders cannot be edited/);
});

test("cancelling restores reserved stock exactly once", () => {
  const { rice, order } = setupOrder();
  assert.equal(db.getProduct(rice.id).stockQty, 9);
  const cancelled = db.updateOrderStatus(order.id, "CANCELLED");
  assert.equal(cancelled.fulfillmentStatus, "CANCELLED");
  assert.equal(db.getProduct(rice.id).stockQty, 10);
  db.updateOrderStatus(order.id, "CANCELLED");
  assert.equal(db.getProduct(rice.id).stockQty, 10);
});

test("kitchen lifecycle proceeds in order after corrections", () => {
  const { order } = setupOrder();
  const statuses = ["ACCEPTED", "PREPARING", "READY", "SERVED", "COMPLETED"];
  let current = order;
  for (const status of statuses) current = db.updateOrderStatus(order.id, status, null, { actor: "merchant" });
  assert.equal(current.fulfillmentStatus, "COMPLETED");
  assert.equal(current.paymentStatus, "PENDING");
  assert.equal(current.history.filter((entry) => entry.type === "status").length, statuses.length);
});

test("M-Pesa phone normalization accepts Kenyan mobile formats and rejects invalid numbers", () => {
  assert.equal(mpesa.normalizeMsisdn("0712 345 678"), "254712345678");
  assert.equal(mpesa.normalizeMsisdn("+254 112 345 678"), "254112345678");
  assert.throws(() => mpesa.normalizeMsisdn("12345"), /valid Kenyan/);
});

test("failed Safaricom callback is recorded and leaves payment pending", () => {
  const { order } = setupOrder();
  db.attachMpesaCheckoutRequest(order.id, "checkout-failed", { phone: "254712345678", amount: order.totalAmount });
  mpesa.handleStkCallback({
    Body: { stkCallback: { CheckoutRequestID: "checkout-failed", ResultCode: 1032, ResultDesc: "Request cancelled by user" } },
  });
  const updated = db.getOrder(order.id);
  assert.equal(updated.paymentStatus, "PENDING");
  assert.equal(updated.mpesaPaymentAttempt.status, "FAILED");
  assert.match(updated.mpesaPaymentAttempt.resultDesc, /cancelled/i);
});

test("successful Safaricom callback with the wrong amount never marks an order paid", () => {
  const { order } = setupOrder();
  db.attachMpesaCheckoutRequest(order.id, "checkout-wrong-amount", { phone: "254712345678", amount: order.totalAmount });
  mpesa.handleStkCallback({
    Body: {
      stkCallback: {
        CheckoutRequestID: "checkout-wrong-amount",
        ResultCode: 0,
        ResultDesc: "Success",
        CallbackMetadata: { Item: [
          { Name: "Amount", Value: order.totalAmount - 1 },
          { Name: "MpesaReceiptNumber", Value: "TESTRECEIPT" },
          { Name: "PhoneNumber", Value: 254712345678 },
        ] },
      },
    },
  });
  const updated = db.getOrder(order.id);
  assert.equal(updated.paymentStatus, "PENDING");
  assert.equal(updated.mpesaPaymentAttempt.status, "FAILED");
  assert.equal(updated.mpesaPaymentAttempt.resultCode, "AMOUNT_MISMATCH");
});