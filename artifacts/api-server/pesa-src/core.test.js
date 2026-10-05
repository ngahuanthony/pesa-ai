const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-si-core-"));
process.env.DATA_DIR = testDataDir;
process.env.ANTHROPIC_API_KEY = "unit-test-only";
process.env.WHATSAPP_TOKEN = "unit-test-only";

const { HOTEL_SHOP_LINK_TRIGGER, SHOP_LINK_TRIGGER, isShopLinkTrigger, handleCustomerMessage, orderActions, scheduleOrderPaymentReminder } = require("./core");
const { runMockAssistant } = require("./ai");
const { processDuePaymentReminders } = require("./whatsapp");
const db = require("./db");

test.after(() => fs.rmSync(testDataDir, { recursive: true, force: true }));

test("recognizes the Skyview hotel QR prompt and legacy shop trigger", () => {
  assert.equal(isShopLinkTrigger(HOTEL_SHOP_LINK_TRIGGER), true);
  assert.equal(isShopLinkTrigger(`  ${HOTEL_SHOP_LINK_TRIGGER.toUpperCase()}  `), true);
  assert.equal(isShopLinkTrigger(SHOP_LINK_TRIGGER), true);
  assert.equal(isShopLinkTrigger("Hi Skyview Opal Hotel, I need a room"), false);
});

test("Skyview gets hotel-specific default welcome and scan copy", () => {
  const welcome = db.generateWelcomeMessage({ name: "Skyview Opal Hotel" });
  assert.match(welcome, /WELCOME TO SKYVIEW OPAL HOTEL/);
  assert.match(welcome, /dine, stay, relax, swim, meet or celebrate/);
  assert.match(welcome, /Your comfort\. Your experience\. Your moment\./);
  assert.equal(db.generateShopEntryPrompt(" SKYVIEW OPAL HOTEL ").toLowerCase(), HOTEL_SHOP_LINK_TRIGGER);
  assert.equal(db.generateShopEntryPrompt("Other Shop"), "Hi, I'd like to shop");
});

test("a confirmed Skyview order is placed when the guest supplies their table number", async () => {
  const hotel = db.mutate((state) => db.createBusiness(state, {
    name: "Skyview Opal Hotel",
    category: "Hospitality",
    merchantType: "hotel",
    phone: "254700000101",
    personalPhone: "254700000102",
    pesaAiNumber: "254700000103",
  }));
  const table = db.createServiceLocation(hotel.id, {
    kind: "TABLE",
    label: "Table 6",
    generatePublicToken: false,
  });
  db.createProduct(hotel.id, { name: "Tea", category: "food", price: 150, stockQty: 0 });
  const customerPhone = "254700000104";

  db.mutate((state) => {
    const customer = db.findOrCreateCustomer(state, hotel.id, customerPhone, "Guest");
    const conversation = db.findOrCreateConversation(state, hotel.id, customer.id, "whatsapp", null);
    db.addMessage(state, conversation.id, "assistant", "Please confirm your order: 1 × Tea. Reply Done to confirm.");
    db.addMessage(state, conversation.id, "customer", "Done");
    db.addMessage(state, conversation.id, "assistant", "Perfect! What is your table number?");
  });

  const responses = [
    {
      stop_reason: "tool_use",
      content: [{
        type: "tool_use",
        id: "create-order-1",
        name: "create_order",
        input: {
          fulfillment_type: "dine_in",
          table_number: 6,
          items: [{ product_name: "Tea", quantity: 1 }],
        },
      }],
    },
    {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Your order is ready." }],
    },
  ];
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_input, init) => {
    requests.push(JSON.parse(init.body));
    const response = responses.shift();
    assert.ok(response, "unexpected extra assistant request");
    return { ok: true, json: async () => response };
  };

  try {
    const result = await handleCustomerMessage({
      business: hotel,
      customerPhone,
      customerName: "Guest",
      channel: "whatsapp",
      text: "6",
    });

    assert.ok(result.order?.id);
    assert.equal(result.order.serviceLocationId, table.id);
    assert.equal(result.order.serviceLocationSnapshot.label, "Table 6");
    assert.equal(result.order.items[0].productName, "Tea");
    assert.match(result.replyText, new RegExp(`Order #${result.order.id.slice(0, 8).toUpperCase()} has been placed for Table 6`));
    assert.match(result.replyText, /1 × Tea/);
    assert.match(result.replyText, /Total: KSh 150/);
    assert.match(result.replyText, /The team will prepare your order/i);
    assert.match(result.replyText, /message us and we'll add it to this order/i);
    assert.doesNotMatch(result.replyText, /Payment details|M-Pesa|Deni|Naomba Receipt|payment option/i);
    const reminder = db.load().paymentReminders.find((item) => item.orderId === result.order.id);
    assert.ok(reminder);
    const reminderDelay = new Date(reminder.dueAt).getTime() - new Date(result.order.createdAt).getTime();
    assert.ok(reminderDelay >= 9 * 60 * 1000 && reminderDelay <= 11 * 60 * 1000);
    assert.doesNotMatch(result.replyText, /Please confirm your order|tell me what you'd like from the menu/i);
    assert.equal(requests.length, 2);
    assert.ok(requests[0].messages.some((message) => message.content === "Done"));
    assert.equal(requests[0].messages.at(-1).content, "6");
    assert.match(requests[0].system, /do not ask them to repeat the order or confirm it a second time/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("order confirmations are friendly and contain no payment details or payment choices", () => {
  const order = {
    id: "order-payment-test",
    totalAmount: 475,
    serviceLocationSnapshot: { kind: "TABLE", label: "Table 6" },
    items: [{ quantity: 1, productName: "Lunch" }],
  };
  const confirmed = orderActions("Order received!", order, {
    mpesa: {
      method: "paybill_account",
      shortcode: "123456",
      accountNumber: "SKYVIEW-6",
      accountMode: "static",
    },
  }, "254700000104");
  assert.match(confirmed.replyText, /Order #ORDER-PA has been placed for Table 6/);
  assert.match(confirmed.replyText, /Total: KSh 475/);
  assert.match(confirmed.replyText, /team will prepare your order/i);
  assert.match(confirmed.replyText, /add it to this order/i);
  assert.doesNotMatch(confirmed.replyText, /Payment details|Business number|Account number|Till|M-Pesa|Deni|payment option/i);
  assert.equal(confirmed.interactiveButtons, null);

  const updated = orderActions("Added!", order, {
    mpesa: { method: "till", shortcode: "654321" },
  }, "254700000104", { orderUpdated: true });
  assert.match(updated.replyText, /I've added those items to order #ORDER-PA for Table 6/);
  assert.doesNotMatch(updated.replyText, /Till 654321|M-Pesa|payment option/i);
});

test("clearly requested add-ons update the customer's single unpaid order", async () => {
  const business = db.mutate((state) => db.createBusiness(state, {
    name: "Add-on Shop",
    category: "Food",
    phone: "254700000301",
    personalPhone: "254700000302",
    pesaAiNumber: "254700000303",
  }));
  const product = db.createProduct(business.id, { name: "Tea", price: 150, stockQty: 10 });
  const customerPhone = "254700000304";
  const customer = db.mutate((state) => db.findOrCreateCustomer(state, business.id, customerPhone, "Guest"));
  const originalOrder = db.mutate((state) => db.createOrder(state, {
    businessId: business.id,
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 1 }],
    fulfillmentType: "takeaway",
  }));
  const responses = [
    {
      stop_reason: "tool_use",
      content: [{
        type: "tool_use",
        id: "add-items-1",
        name: "add_items_to_open_order",
        input: { items: [{ product_name: "Tea", quantity: 2 }] },
      }],
    },
    {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "I added the tea to your order." }],
    },
  ];
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_input, init) => {
    requests.push(JSON.parse(init.body));
    const response = responses.shift();
    assert.ok(response, "unexpected extra assistant request");
    return { ok: true, json: async () => response };
  };

  try {
    const result = await handleCustomerMessage({
      business,
      customerPhone,
      customerName: "Guest",
      channel: "whatsapp",
      text: "Please add two Tea to my order",
    });

    assert.equal(result.order.id, originalOrder.id);
    assert.equal(db.listOrders(business.id).length, 1);
    assert.equal(result.order.items[0].quantity, 3);
    assert.equal(result.order.totalAmount, 450);
    assert.match(result.replyText, /I've added those items to order/i);
    assert.match(result.replyText, /Total: KSh 450/);
    assert.doesNotMatch(result.replyText, /Payment details|M-Pesa|Deni|payment option/i);
    assert.match(requests[0].system, /UNPAID OPEN ORDERS FOR THIS CUSTOMER/);
    assert.equal(db.load().paymentReminders.find((item) => item.orderId === originalOrder.id)?.status, "pending");
  } finally {
    global.fetch = originalFetch;
  }
});

test("payment reminders send the latest total and omit the retired Deni button", async () => {
  const business = db.mutate((state) => db.createBusiness(state, {
    name: "Reminder Shop",
    category: "Food",
    phone: "254700000401",
    personalPhone: "254700000402",
    pesaAiNumber: "254700000403",
  }));
  db.updateBusiness(business.id, {
    whatsappPhoneNumberId: "test-phone-number-id",
    paymentMethod: "mpesa",
    mpesa: { method: "till", shortcode: "123456", enabled: true, verified: true },
  }, "unit_test");
  const product = db.createProduct(business.id, { name: "Coffee", price: 200, stockQty: 10 });
  const customerPhone = "254700000404";
  const customer = db.mutate((state) => db.findOrCreateCustomer(state, business.id, customerPhone, "Guest"));
  const order = db.mutate((state) => db.createOrder(state, {
    businessId: business.id,
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 1 }],
    fulfillmentType: "takeaway",
  }));
  db.updateOrderItems(order.id, [{ productId: product.id, quantity: 3 }]);
  db.schedulePaymentReminder({
    businessId: business.id,
    orderId: order.id,
    customerPhone,
    dueAt: new Date(Date.now() - 1000).toISOString(),
  });

  const sentPayloads = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    sentPayloads.push(JSON.parse(init.body));
    return { ok: true };
  };
  try {
    const result = await processDuePaymentReminders({ orderId: order.id });
    assert.deepEqual(result.map((entry) => entry.status), ["sent"]);
    assert.equal(sentPayloads.length, 1);
    const interactive = sentPayloads[0].interactive;
    assert.match(interactive.body.text, /Current total: KSh 600/);
    assert.match(interactive.body.text, /Till 123456/);
    const buttonIds = interactive.action.buttons.map((button) => button.reply.id.split(":")[0]);
    assert.deepEqual(buttonIds, ["mpesa_pay", "receipt"]);
    assert.equal(db.load().paymentReminders.find((item) => item.orderId === order.id).status, "sent");
  } finally {
    global.fetch = originalFetch;
  }
});

test("payment reminders are skipped for paid or cancelled orders", async () => {
  const business = db.mutate((state) => db.createBusiness(state, {
    name: "Reminder Skip Shop",
    category: "Food",
    phone: "254700000501",
    personalPhone: "254700000502",
    pesaAiNumber: "254700000503",
  }));
  const product = db.createProduct(business.id, { name: "Snack", price: 50, stockQty: 10 });
  const customerPhone = "254700000504";
  const customer = db.mutate((state) => db.findOrCreateCustomer(state, business.id, customerPhone, "Guest"));
  const paidOrder = db.mutate((state) => db.createOrder(state, {
    businessId: business.id, customerId: customer.id, items: [{ productId: product.id, quantity: 1 }],
  }));
  const cancelledOrder = db.mutate((state) => db.createOrder(state, {
    businessId: business.id, customerId: customer.id, items: [{ productId: product.id, quantity: 1 }],
  }));
  db.updateOrderStatus(paidOrder.id, "paid", { paymentMethod: "mpesa", mpesaTxnId: "TEST-REF" });
  db.updateOrderStatus(cancelledOrder.id, "cancelled");
  for (const order of [paidOrder, cancelledOrder]) {
    db.schedulePaymentReminder({
      businessId: business.id,
      orderId: order.id,
      customerPhone,
      dueAt: new Date(Date.now() - 1000).toISOString(),
    });
  }

  const paidResult = await processDuePaymentReminders({ orderId: paidOrder.id });
  const cancelledResult = await processDuePaymentReminders({ orderId: cancelledOrder.id });
  assert.deepEqual(paidResult.map((entry) => entry.status), ["skipped"]);
  assert.deepEqual(cancelledResult.map((entry) => entry.status), ["skipped"]);
});

test("takeaway payment reminders are due immediately", () => {
  const business = { id: "takeaway-reminder-business" };
  const now = Date.now();
  const reminder = scheduleOrderPaymentReminder({
    id: "takeaway-reminder-order",
    fulfillmentType: "takeaway",
    createdAt: new Date(now).toISOString(),
  }, business, "254700000601");
  const delay = new Date(reminder.dueAt).getTime() - now;
  assert.ok(delay >= 0 && delay < 1000);
});

test("the no-key assistant adds exact catalog items to one existing open order", () => {
  const business = db.mutate((state) => db.createBusiness(state, {
    name: "Mock Add-on Shop",
    category: "Food",
    phone: "254700000701",
    personalPhone: "254700000702",
    pesaAiNumber: "254700000703",
  }));
  const tea = db.createProduct(business.id, { name: "Tea", price: 100, stockQty: 10 });
  const customer = db.mutate((state) => db.findOrCreateCustomer(state, business.id, "254700000704", "Guest"));
  const existingOrder = db.mutate((state) => db.createOrder(state, {
    businessId: business.id,
    customerId: customer.id,
    items: [{ productId: tea.id, quantity: 1 }],
    fulfillmentType: "takeaway",
  }));

  const result = runMockAssistant(business, customer.id, [], "please add 2 Tea to my order");
  assert.equal(result.order.id, existingOrder.id);
  assert.equal(result.order.items[0].quantity, 3);
  assert.equal(result.order.totalAmount, 300);
  assert.equal(db.listOrders(business.id).length, 1);
});

test("the no-key assistant fallback places only a previously confirmed table order", () => {
  const hotel = db.mutate((state) => db.createBusiness(state, {
    name: "Skyview Opal Hotel",
    category: "Hospitality",
    merchantType: "hotel",
    phone: "254700000201",
    personalPhone: "254700000202",
    pesaAiNumber: "254700000203",
  }));
  const table = db.createServiceLocation(hotel.id, { kind: "TABLE", label: "Table 6" });
  const tea = db.createProduct(hotel.id, { name: "Tea", category: "food", price: 150, stockQty: 0 });
  const customer = db.mutate((state) => db.findOrCreateCustomer(state, hotel.id, "254700000204", "Guest"));
  const history = [
    { role: "assistant", content: "Please confirm your order:\n1 × Tea\nReply Done to confirm." },
    { role: "customer", content: "Done" },
    { role: "assistant", content: "Perfect! What is your table number?" },
  ];

  const placed = runMockAssistant(hotel, customer.id, history, "6", {
    tableNumberJustProvided: 6,
    serviceLocationId: table.id,
  });

  assert.ok(placed.order?.id);
  assert.equal(placed.order.serviceLocationSnapshot.label, "Table 6");
  assert.equal(placed.order.items[0].productId, tea.id);
  assert.equal(placed.order.items[0].quantity, 1);

  const unconfirmed = runMockAssistant(hotel, customer.id, [
    { role: "assistant", content: "What is your table number?" },
  ], "6", {
    tableNumberJustProvided: 6,
    serviceLocationId: table.id,
  });
  assert.equal(unconfirmed.order, null);
  assert.match(unconfirmed.replyText, /only the missing item names and quantities/i);
});

test("normalizes Kenyan international numbers without a duplicate trunk zero", () => {
  assert.equal(db.normalizePhone("+254 0712 345 678"), "254712345678");
  assert.equal(db.normalizePhone("0712 345 678"), "254712345678");
  assert.equal(typeof db.runOneTimeWhatsAppNumberCorrection, "function");
});