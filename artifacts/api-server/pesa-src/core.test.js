const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-si-core-"));
process.env.DATA_DIR = testDataDir;
process.env.ANTHROPIC_API_KEY = "unit-test-only";

const { HOTEL_SHOP_LINK_TRIGGER, SHOP_LINK_TRIGGER, isShopLinkTrigger, handleCustomerMessage, orderActions } = require("./core");
const { runMockAssistant } = require("./ai");
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
    assert.match(result.replyText, /hotel team will confirm payment details shortly/i);
    assert.doesNotMatch(result.replyText, /Payment details:/);
    assert.doesNotMatch(result.replyText, /Please confirm your order|tell me what you'd like from the menu/i);
    assert.equal(requests.length, 2);
    assert.ok(requests[0].messages.some((message) => message.content === "Done"));
    assert.equal(requests[0].messages.at(-1).content, "6");
    assert.match(requests[0].system, /do not ask them to repeat the order or confirm it a second time/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("order confirmations include the saved Paybill account or Till instructions", () => {
  const order = {
    id: "order-payment-test",
    totalAmount: 475,
    serviceLocationSnapshot: { kind: "TABLE", label: "Table 6" },
    items: [{ quantity: 1, productName: "Lunch" }],
  };
  const paybill = orderActions("Order received!", order, {
    mpesa: {
      method: "paybill_account",
      shortcode: "123456",
      accountNumber: "SKYVIEW-6",
      accountMode: "static",
    },
  }, "254700000104");
  assert.match(paybill.replyText, /Business number 123456/);
  assert.match(paybill.replyText, /Account number: SKYVIEW-6/);
  assert.doesNotMatch(paybill.replyText, /confirm payment details shortly/i);

  const till = orderActions("Order received!", order, {
    mpesa: { method: "till", shortcode: "654321" },
  }, "254700000104");
  assert.match(till.replyText, /Buy Goods and Services → Till 654321/);
  assert.doesNotMatch(till.replyText, /Account number:/);
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