const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-whatsapp-webhook-"));
process.env.ENCRYPTION_KEY = "c".repeat(64);
delete process.env.ANTHROPIC_API_KEY;
process.env.WHATSAPP_TOKEN = "unit-test-whatsapp-token";
process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID = "platform-phone-id";
process.env.WHATSAPP_PLATFORM_DISPLAY_NUMBER = "254700000099";

const db = require("./db");
const whatsapp = require("./whatsapp");

function business(name, phoneNumberId, phone, { category = "Retail", merchantType = "retail" } = {}) {
  const created = db.mutate((state) => db.createBusiness(state, {
    name, category, merchantType, phone, pesaAiNumber: phone,
  }));
  return db.updateBusiness(created.id, {
    whatsappPhoneNumberId: phoneNumberId,
    whatsappNumber: phone,
    whatsappConnectionStatus: "live",
    welcomeMessage: `Welcome to ${name}!`,
  });
}

function webhook(phoneNumberId, text, from = "254711111111") {
  return {
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: phoneNumberId },
      contacts: [{ profile: { name: "Test Customer" } }],
      messages: [{ from, type: "text", text: { body: text } }],
    } }] }],
  };
}

test.beforeEach(() => {
  db.mutate((state) => {
    state.businesses = [];
    state.accounts = [];
    state.products = [];
    state.customers = [];
    state.conversations = [];
    state.messages = [];
    state.orders = [];
  });
});

test("shop QR sends the configured welcome before the catalogue response", async () => {
  const account = business("Greeting Duka", "meta-greeting-id", "254700000001");
  db.createProduct(account.id, { name: "Tea", price: 120, stockQty: 8 });
  const oldFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, status: 200, text: async () => "" };
  };
  try {
    await whatsapp.handleIncomingWebhook(webhook(account.whatsappPhoneNumberId, "Hi, I'd like to shop"));
  } finally {
    global.fetch = oldFetch;
  }

  assert.equal(calls.length, 2);
  const [welcomeCall, catalogueCall] = calls;
  assert.equal(welcomeCall.url, "https://graph.facebook.com/v21.0/meta-greeting-id/messages");
  assert.equal(catalogueCall.url, welcomeCall.url);
  assert.equal(JSON.parse(welcomeCall.options.body).text.body, account.welcomeMessage);
  const catalogueReply = JSON.parse(catalogueCall.options.body).text.body;
  assert.match(catalogueReply, /\[mock AI/);
  assert.match(catalogueReply, /Tea — KES 120/);
});

test("Skyview's exact hospitality QR prompt sends welcome then a zero-quantity menu response", async () => {
  const hotel = business("Skyview Opal Hotel", "1391881137336168", "254700000099", {
    category: "Hospitality",
    merchantType: "hospitality",
  });
  db.createProduct(hotel.id, { name: "Chicken Pilau", price: 650, stockQty: 0 });

  const oldFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, status: 200, text: async () => "" };
  };
  try {
    await whatsapp.handleIncomingWebhook(webhook(
      "1391881137336168",
      db.generateShopEntryPrompt(hotel),
      "254711111115",
    ));
  } finally {
    global.fetch = oldFetch;
  }

  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.url === "https://graph.facebook.com/v21.0/1391881137336168/messages"));
  assert.equal(JSON.parse(calls[0].options.body).text.body, hotel.welcomeMessage);
  assert.match(JSON.parse(calls[1].options.body).text.body, /Chicken Pilau — KES 650/);
  assert.doesNotMatch(JSON.parse(calls[1].options.body).text.body, /out of stock/i);
});

test("WhatsApp photo replies describe zero-quantity hospitality items as available on the menu", async () => {
  const hotel = business("Sample Restaurant", "restaurant-phone-id", "254700000099", {
    category: "Restaurant",
    merchantType: "hospitality",
  });
  db.createProduct(hotel.id, {
    name: "Chicken Pilau",
    price: 650,
    stockQty: 0,
    imageUrl: "https://images.example.test/chicken-pilau.jpg",
  });

  const oldFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, status: 200, text: async () => "" };
  };
  try {
    await whatsapp.handleIncomingWebhook(webhook(hotel.whatsappPhoneNumberId, "Chicken Pilau"));
  } finally {
    global.fetch = oldFetch;
  }

  assert.equal(calls.length, 1);
  const image = JSON.parse(calls[0].options.body).image;
  assert.match(image.caption, /Available while on the menu/);
  assert.doesNotMatch(image.caption, /out of stock/i);
});

test("routing uses exact phone_number_id and outbound calls use that inbound ID", async () => {
  const first = business("First Duka", "meta-first-id", "254700000002");
  const second = business("Second Duka", "meta-second-id", "254700000003");
  assert.equal(db.getBusinessByWhatsappPhoneNumberId("meta-second-id").id, second.id);
  assert.equal(db.getBusinessByWhatsappPhoneNumberId("meta-first-id").id, first.id);

  const oldFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, status: 200, text: async () => "" };
  };
  try {
    await whatsapp.handleIncomingWebhook(webhook("meta-second-id", "What do you have?", "254711111113"));
  } finally {
    global.fetch = oldFetch;
  }
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/meta-second-id\/messages$/);
  const customer = db.load().customers.find((item) => item.phone === "254711111113");
  assert.equal(customer.businessId, second.id);
});

test("Skyview phone-number-ID correction changes only its exact business routing ID", () => {
  const skyview = business("Skyview Opal Hotel", "saved-skyview-id", "254772111111");
  const similarlyNamed = business("Skyview Opal Hotel Annex", "annex-phone-id", "254772111112");
  db.updateBusiness(skyview.id, {
    whatsappWabaId: "preserve-waba-id",
    whatsappRequestedPhone: "254772111111",
    whatsappAccessTokenEnc: "preserve-encrypted-token",
  });
  const before = { ...db.load().businesses.find((item) => item.id === skyview.id) };
  const migrationId = "test-skyview-meta-phone-id-correction";

  const result = db.runOneTimeExactWhatsAppPhoneNumberIdCorrection({
    businessName: "Skyview Opal Hotel",
    phoneNumberId: "1391881137336168",
    migrationId,
  });

  const after = { ...db.load().businesses.find((item) => item.id === skyview.id) };
  assert.deepEqual(
    { ...after, whatsappPhoneNumberId: before.whatsappPhoneNumberId },
    before,
  );
  assert.equal(after.whatsappPhoneNumberId, "1391881137336168");
  assert.equal(db.load().businesses.find((item) => item.id === similarlyNamed.id).whatsappPhoneNumberId, "annex-phone-id");
  assert.deepEqual(result, { applied: true, businessId: skyview.id });
  assert.deepEqual(db.load().migrations[migrationId].fields, ["whatsappPhoneNumberId"]);

  const repeated = db.runOneTimeExactWhatsAppPhoneNumberIdCorrection({
    businessName: "Skyview Opal Hotel",
    phoneNumberId: "1391881137336168",
    migrationId,
  });
  assert.equal(repeated.reason, "already-applied");
});

test("Skyview phone-number-ID correction refuses another business's assigned ID", () => {
  const skyview = business("Skyview Opal Hotel", "saved-skyview-id", "254772111113");
  const other = business("Other Duka", "1391881137336168", "254772111114");
  db.mutate((state) => {
    state.businesses.find((item) => item.id === other.id).whatsappPhoneNumberId = 1391881137336168;
  });
  const before = { ...db.load().businesses.find((item) => item.id === skyview.id) };
  const migrationId = "test-skyview-meta-phone-id-conflict";

  const result = db.runOneTimeExactWhatsAppPhoneNumberIdCorrection({
    businessName: "Skyview Opal Hotel",
    phoneNumberId: "1391881137336168",
    migrationId,
  });

  assert.equal(result.reason, "phone-number-id-already-assigned");
  assert.equal(result.conflictingBusinessId, other.id);
  assert.deepEqual(db.load().businesses.find((item) => item.id === skyview.id), before);
  assert.equal(db.load().migrations[migrationId], undefined);
});

test("hospitality public shops show active zero-quantity items as menu availability", () => {
  const hotel = business("Skyview Opal Hotel", "1391881137336168", "254700000099", {
    category: "Hospitality",
    merchantType: "hospitality",
  });
  db.createProduct(hotel.id, {
    name: "Chicken Pilau",
    price: 650,
    stockQty: 0,
    imageUrl: "https://images.example.test/chicken-pilau.jpg",
  });

  const publicShop = db.getPublicShopBySlug(db.getPublicShopSlug(hotel));
  assert.equal(publicShop.popularProducts[0].name, "Chicken Pilau");
  assert.equal(publicShop.popularProducts[0].stockQty, 0);
  assert.equal(publicShop.popularProducts[0].availabilityMode, "menu");
  assert.equal(publicShop.popularProducts[0].active, true);
  assert.equal(new URL(publicShop.whatsappUrl).searchParams.get("text"), db.generateShopEntryPrompt(hotel));

  const matches = db.searchPublicProducts(hotel.id, "pilau");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].stockQty, 0);
  assert.equal(matches[0].availabilityMode, "menu");
  assert.equal(matches[0].active, true);
});

test("hospitality orders can use zero quantity without decrementing or restoring retail stock", () => {
  const hotel = business("Sample Restaurant", "restaurant-phone-id", "254700000099", {
    category: "Restaurant",
    merchantType: "hospitality",
  });
  const product = db.createProduct(hotel.id, { name: "Soup", price: 300, stockQty: 0 });
  const order = db.mutate((state) => db.createOrder(state, {
    businessId: hotel.id,
    customerId: "test-customer",
    items: [{ productId: product.id, quantity: 2 }],
  }));

  assert.equal(order.stockTracked, false);
  assert.equal(db.getProduct(product.id).stockQty, 0);
  db.updateOrderItems(order.id, [{ productId: product.id, quantity: 3 }]);
  assert.equal(db.getProduct(product.id).stockQty, 0);
  db.updateOrderStatus(order.id, "cancelled");
  assert.equal(db.getProduct(product.id).stockQty, 0);
});

test("legacy display-number fallback is platform-only and unique", () => {
  const legacy = business("Legacy Duka", null, "254700000099");
  assert.equal(db.getBusinessByWhatsappPhoneNumberId("platform-phone-id").id, legacy.id);
  assert.equal(db.getBusinessByWhatsappPhoneNumberId("not-platform-phone-id"), undefined);

  const duplicate = business("Duplicate Legacy Duka", null, "254700000098");
  db.updateBusiness(duplicate.id, { whatsappNumber: "254700000099" });
  assert.equal(db.getBusinessByWhatsappPhoneNumberId("platform-phone-id"), undefined);
});