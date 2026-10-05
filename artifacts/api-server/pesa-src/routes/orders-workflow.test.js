const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-si-orders-"));
const db = require("../db");
const mpesa = require("../mpesa");
const whatsapp = require("../whatsapp");
const orderRoutes = require("./orders");

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

test("new orders receive increasing business-local order numbers", () => {
  const { business, order } = setupOrder();
  const next = db.mutate((state) => db.createOrder(state, {
    businessId: business.id,
    customerId: order.customerId,
    items: [{ productId: order.items[0].productId, quantity: 1 }],
  }));
  assert.equal(order.orderNumber, 1001);
  assert.equal(next.orderNumber, 1002);
  assert.equal(db.orderReference(next), "#1002");
});

test("legacy orders are numbered oldest-first and mapped to separate payment and fulfilment states", () => {
  const { business } = setupOrder();
  const state = JSON.parse(fs.readFileSync(db.DATA_FILE, "utf8"));
  state.orders.push(
    { id: "legacy-new", businessId: business.id, status: "pending", createdAt: "2024-01-02T10:00:00.000Z" },
    { id: "legacy-old", businessId: business.id, status: "confirmed", createdAt: "2024-01-01T10:00:00.000Z" },
  );
  fs.writeFileSync(db.DATA_FILE, JSON.stringify(state));

  const migrated = db.load().orders;
  const older = migrated.find((order) => order.id === "legacy-old");
  const newer = migrated.find((order) => order.id === "legacy-new");
  assert.ok(older.orderNumber < newer.orderNumber);
  assert.equal(older.fulfillmentStatus, "ACCEPTED");
  assert.equal(older.paymentStatus, "PENDING");
  assert.equal(newer.fulfillmentStatus, "NEW");
  assert.equal(newer.paymentStatus, "PENDING");
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

test("orders cannot close until served and paid", () => {
  const { order } = setupOrder();
  const statuses = ["ACCEPTED", "PREPARING", "READY", "SERVED"];
  let current = order;
  for (const status of statuses) current = db.updateOrderStatus(order.id, status, null, { actor: "merchant" });
  assert.throws(
    () => db.updateOrderStatus(order.id, "COMPLETED", null, { actor: "merchant" }),
    /served and paid/,
  );
  current = db.updateOrderStatus(order.id, "paid", {
    paymentMethod: "cash",
    paymentRef: "TEST-CASH",
  }, { actor: "staff-account-1" });
  current = db.updateOrderStatus(order.id, "COMPLETED", null, { actor: "staff-account-1" });
  assert.equal(current.fulfillmentStatus, "COMPLETED");
  assert.equal(current.paymentStatus, "PAID");
  assert.equal(current.paymentMeta.paymentMethod, "cash");
  assert.ok(current.paymentMeta.paidAt);
  const paymentAudit = current.history.find((entry) => entry.type === "payment");
  assert.equal(paymentAudit.actor, "staff-account-1");
  assert.equal(paymentAudit.paymentMethod, "cash");
  assert.ok(paymentAudit.at);
});

test("manual payment route validates method and records staff actor and time", async () => {
  const { business, order } = setupOrder();
  const params = { businessId: business.id, orderId: order.id };
  const session = { businessId: business.id, accountId: "staff-account-2" };
  await assert.rejects(
    () => orderRoutes.markPaid({ params, body: { paymentMethod: "mpesa-stk" }, session }),
    /paymentMethod must be cash, card, or mpesa-manual/,
  );
  const updated = await orderRoutes.markPaid({
    params,
    body: { paymentMethod: "mpesa-manual", paymentRef: "MANUAL-REF" },
    session,
  });
  assert.equal(updated.paymentStatus, "PAID");
  assert.equal(updated.paymentMeta.paymentMethod, "mpesa-manual");
  assert.equal(updated.paymentMeta.paymentRef, "MANUAL-REF");
  assert.equal(updated.history.at(-1).actor, "staff-account-2");
  assert.ok(updated.history.at(-1).at);
});

test("manual payment sends Skyview's thank-you only for Skyview Opal Hotel", async () => {
  const originalResolveAccessToken = whatsapp.resolveAccessToken;
  const originalSendMessage = whatsapp.sendMessage;
  const sentMessages = [];
  whatsapp.resolveAccessToken = () => "mock-token";
  whatsapp.sendMessage = async (...args) => {
    sentMessages.push(args);
    return { messages: [{ id: "mock-message" }] };
  };

  try {
    const skyview = setupOrder();
    db.mutate((state) => {
      const business = state.businesses.find((entry) => entry.id === skyview.business.id);
      business.name = "Skyview Opal Hotel";
      business.whatsappPhoneNumberId = "mock-phone-number-id";
    });
    for (const status of ["ACCEPTED", "PREPARING", "READY", "SERVED"]) {
      await orderRoutes.updateStatus({
        params: { businessId: skyview.business.id, orderId: skyview.order.id },
        body: { status },
        session: { businessId: skyview.business.id, accountId: "staff-skyview" },
      });
    }
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0][2], /accepted and is now in preparation\. It will be served shortly/);
    await orderRoutes.markPaid({
      params: { businessId: skyview.business.id, orderId: skyview.order.id },
      body: { paymentMethod: "cash" },
      session: { businessId: skyview.business.id, accountId: "staff-skyview" },
    });
    assert.equal(sentMessages.length, 2);
    assert.equal(sentMessages[1][2], "✨ *Thank You for Visiting Skyview Opal!*\n\nThank you for choosing *Skyview Opal Hotel*. It was our pleasure having you with us, and we hope you enjoyed your experience.\n\nWe look forward to welcoming you back again soon! 💙\n\n*Skyview Opal — We can’t wait to see you again!*");

    const otherBusiness = setupOrder();
    db.mutate((state) => {
      const business = state.businesses.find((entry) => entry.id === otherBusiness.business.id);
      business.name = "Another Hotel";
      business.whatsappPhoneNumberId = "mock-phone-number-id";
    });
    await orderRoutes.markPaid({
      params: { businessId: otherBusiness.business.id, orderId: otherBusiness.order.id },
      body: { paymentMethod: "cash" },
      session: { businessId: otherBusiness.business.id, accountId: "staff-other" },
    });
    assert.equal(sentMessages.length, 3);
    assert.match(sentMessages[2][2], /^✅ Payment received for order/);
    assert.doesNotMatch(sentMessages[2][2], /Skyview Opal/);
  } finally {
    whatsapp.resolveAccessToken = originalResolveAccessToken;
    whatsapp.sendMessage = originalSendMessage;
  }
});

test("Skyview sends appreciation only after an order is both served and paid, once", async () => {
  const originalResolveAccessToken = whatsapp.resolveAccessToken;
  const originalSendMessage = whatsapp.sendMessage;
  const sentMessages = [];
  whatsapp.resolveAccessToken = () => "mock-token";
  whatsapp.sendMessage = async (...args) => {
    sentMessages.push(args);
    return { messages: [{ id: "mock-message" }] };
  };

  try {
    const { business, order } = setupOrder();
    db.mutate((state) => {
      const savedBusiness = state.businesses.find((entry) => entry.id === business.id);
      savedBusiness.name = "Skyview Opal Hotel";
      savedBusiness.whatsappPhoneNumberId = "mock-phone-number-id";
    });
    const params = { businessId: business.id, orderId: order.id };
    const session = { businessId: business.id, accountId: "staff-sequence" };

    await orderRoutes.markPaid({ params, body: { paymentMethod: "cash" }, session });
    assert.equal(sentMessages.length, 0, "payment alone must not send the visit appreciation message");

    for (const status of ["ACCEPTED", "PREPARING", "READY", "SERVED"]) {
      await orderRoutes.updateStatus({ params, body: { status }, session });
    }
    assert.equal(sentMessages.length, 2);
    assert.match(sentMessages[0][2], /accepted and is now in preparation/);
    assert.match(sentMessages[1][2], /^✨ \*Thank You for Visiting Skyview Opal!\*/);
    assert.ok(db.getOrder(order.id).customerThankYouSentAt);

    await orderRoutes.updateStatus({ params, body: { status: "COMPLETED" }, session });
    assert.equal(sentMessages.length, 2, "closing a paid order must not send a duplicate appreciation message");
  } finally {
    whatsapp.resolveAccessToken = originalResolveAccessToken;
    whatsapp.sendMessage = originalSendMessage;
  }
});

test("status route rejects closing a served but unpaid order", async () => {
  const { business, order } = setupOrder();
  let current = order;
  for (const status of ["ACCEPTED", "PREPARING", "READY", "SERVED"]) {
    current = db.updateOrderStatus(order.id, status);
  }
  await assert.rejects(
    () => orderRoutes.updateStatus({
      params: { businessId: business.id, orderId: order.id },
      body: { status: "COMPLETED" },
      session: { businessId: business.id, accountId: "staff-account-3" },
    }),
    /served and paid/,
  );
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