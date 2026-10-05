const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-si-intelligence-"));
process.env.DATA_DIR = dataDir;
process.env.ANTHROPIC_API_KEY = "";
const db = require("../db");
const merchantIntelligence = require("./merchant-intelligence");
const { handleCustomerMessage, extractTableNumber } = require("../core");
const hospitalityMenu = require("../hospitality-menu");
const mpesa = require("../mpesa");
const { buildKnowledgeContext, runClaudeAssistant } = require("../ai");
const { buildConciergeList, buildWhatsAppListPayload, getConciergePrompt } = require("../concierge");

function business(name) {
  return db.mutate((state) => db.createBusiness(state, {
    name, category: "Hospitality", merchantType: "hotel",
    phone: `254700${Math.floor(Math.random() * 900000 + 100000)}`,
    personalPhone: "254711111111", pesaAiNumber: `254722${Math.floor(Math.random() * 900000 + 100000)}`,
  }));
}

test("knowledge and service locations are tenant scoped", () => {
  const a = business("Hotel A");
  const b = business("Hotel B");
  const entry = db.createKnowledgeEntry(a.id, { title: "Breakfast", category: "menu", text: "Served 7am to 10am", source: "approved brochure" });
  const location = db.createServiceLocation(a.id, { kind: "TABLE", label: "Table 12" });
  assert.equal(db.listKnowledgeEntries(b.id).length, 0);
  assert.equal(db.listServiceLocations(b.id).length, 0);
  assert.equal(db.resolveServiceLocation(location.publicToken).business.id, a.id);
  assert.throws(() => db.updateKnowledgeEntry(b.id, entry.id, { text: "leak" }), /not found/i);
});

test("Table 1–40 provisioning is tenant-scoped and idempotent", () => {
  const a = business("Hotel Default Tables A");
  const b = business("Hotel Default Tables B");
  const first = merchantIntelligence.locations.createDefaultTables({
    params: { businessId: a.id },
    session: { businessId: a.id },
  });

  assert.equal(first.status, 201);
  assert.equal(first.data.created, 40);
  assert.equal(first.data.existing, 0);
  assert.equal(first.data.locations.length, 40);
  assert.equal(first.data.locations[0].label, "Table 1");
  assert.equal(first.data.locations[11].label, "Table 12");
  assert.equal(first.data.locations[34].label, "Table 35");
  assert.equal(first.data.locations[39].label, "Table 40");
  assert.ok(first.data.locations.every((location) => location.kind === "TABLE" && location.active && location.publicToken));
  assert.equal(db.listServiceLocations(b.id).length, 0);

  const second = merchantIntelligence.locations.createDefaultTables({
    params: { businessId: a.id },
    session: { businessId: a.id },
  });
  assert.equal(second.data.created, 0);
  assert.equal(second.data.existing, 40);
  assert.equal(db.listServiceLocations(a.id).length, 40);
});

test("Skyview production migration preserves the aggregate location and enables number-only table orders", async () => {
  const hotel = business("Skyview Opal Hotel");
  const preservedLocation = db.createServiceLocation(hotel.id, { kind: "OTHER", label: "Lobby", active: false });
  const preexistingTable = db.createServiceLocation(hotel.id, { kind: "TABLE", label: "Table 7", active: false });
  const otherHotel = business("Unrelated Hotel");
  db.createProduct(hotel.id, { name: "Tea", category: "food", price: 150, stockQty: 5 });

  const noAggregateMigration = db.runOneTimeSkyviewTableLocationsMigration({
    businessName: "Skyview Opal Hotel",
    aggregateLabel: "Table 1–40",
    migrationId: "test-skyview-opal-hotel-table-locations-without-aggregate",
  });
  assert.equal(noAggregateMigration.applied, true);
  assert.equal(noAggregateMigration.aggregateLocationId, null);
  assert.equal(noAggregateMigration.aggregateMatchCount, 0);
  assert.equal(noAggregateMigration.created, 39);
  assert.equal(noAggregateMigration.existing, 1);
  assert.equal(noAggregateMigration.activated, 1);
  assert.deepEqual(
    db.listServiceLocations(hotel.id).find((location) => location.id === preservedLocation.id),
    preservedLocation,
  );

  const aggregate = db.createServiceLocation(hotel.id, { kind: "OTHER", label: "Table 1-40" });
  const options = {
    businessName: "Skyview Opal Hotel",
    aggregateLabel: "Table 1–40",
    migrationId: "test-skyview-opal-hotel-table-locations",
  };
  const unrelatedBusiness = db.runOneTimeSkyviewTableLocationsMigration({
    ...options,
    businessName: "Unrelated Hotel",
    migrationId: "test-unrelated-hotel-table-locations",
  });
  assert.equal(unrelatedBusiness.applied, false);
  assert.equal(unrelatedBusiness.reason, "unsupported-business");
  assert.equal(db.listServiceLocations(otherHotel.id).length, 0);

  const migration = db.runOneTimeSkyviewTableLocationsMigration(options);
  assert.equal(migration.applied, true);
  assert.equal(migration.created, 0);
  assert.equal(migration.existing, 40);
  assert.equal(migration.activated, 0);
  assert.equal(migration.aggregateLocationId, aggregate.id);
  assert.equal(migration.aggregateMatchCount, 1);

  const locations = db.listServiceLocations(hotel.id);
  const tables = locations.filter((location) => location.kind === "TABLE");
  assert.equal(tables.length, 40);
  assert.ok(tables.every((location) => location.active));
  assert.ok(tables.filter((location) => location.id !== preexistingTable.id).every((location) => !location.publicToken));
  assert.deepEqual(
    [aggregate.id, aggregate.kind, aggregate.label, aggregate.active],
    [locations.find((location) => location.id === aggregate.id).id, "OTHER", "Table 1-40", true],
  );
  assert.equal(
    locations.find((location) => location.id === preexistingTable.id).publicToken,
    preexistingTable.publicToken,
  );
  assert.equal(db.listServiceLocations(otherHotel.id).length, 0);

  const repeated = db.runOneTimeSkyviewTableLocationsMigration(options);
  assert.equal(repeated.applied, false);
  assert.equal(repeated.reason, "already-applied");
  assert.equal(db.listServiceLocations(hotel.id).length, 42);

  const phone = "254799000040";
  const firstScan = await handleCustomerMessage({
    business: hotel,
    customerPhone: phone,
    channel: "whatsapp",
    text: db.generateShopEntryPrompt("Skyview Opal Hotel"),
  });
  assert.equal(firstScan.interactiveList.rows.length, 6);
  const menu = await handleCustomerMessage({
    business: hotel,
    customerPhone: phone,
    channel: "whatsapp",
    text: getConciergePrompt("concierge:food"),
  });
  assert.match(menu.replyText, /send your table number \(1–40\) by itself first/i);
  const tableReply = await handleCustomerMessage({
    business: hotel,
    customerPhone: phone,
    channel: "whatsapp",
    text: "12",
  });
  const table12 = tables.find((location) => location.label === "Table 12");
  assert.equal(tableReply.conversation.serviceLocationId, table12.id);
  assert.match(tableReply.replyText, /you're connected to Table 12/i);

  const order = await handleCustomerMessage({
    business: hotel,
    customerPhone: phone,
    channel: "whatsapp",
    text: "order: Tea x1",
  });
  assert.equal(order.order.serviceLocationId, table12.id);
  assert.equal(order.order.serviceLocationSnapshot.label, "Table 12");

  const table40 = tables.find((location) => location.label === "Table 40");
  db.mutate((state) => {
    state.serviceLocations = state.serviceLocations.filter((location) => location.id !== table40.id);
  });
  const repairedTables = merchantIntelligence.locations.createDefaultTables({
    params: { businessId: hotel.id },
    session: { businessId: hotel.id },
  });
  assert.equal(repairedTables.data.created, 1);
  assert.equal(
    db.listServiceLocations(hotel.id).find((location) => location.label === "Table 40").publicToken,
    null,
  );
  const addedHotelLocation = merchantIntelligence.locations.create({
    params: { businessId: hotel.id },
    session: { businessId: hotel.id },
    body: { kind: "OTHER", label: "Pool" },
  });
  assert.equal(addedHotelLocation.data.publicToken, null);
  assert.equal(db.listServiceLocations(hotel.id).length, 43);
});

test("table-number parsing accepts explicit and prompted numeric replies only", () => {
  assert.equal(extractTableNumber("I'm at Table #12", ""), 12);
  assert.equal(extractTableNumber("12", "What table number are you at?"), 12);
  assert.equal(extractTableNumber("12", "How many would you like?"), null);
  assert.equal(extractTableNumber("Table 36", ""), 36);
  assert.equal(extractTableNumber("Table 40", ""), 40);
  assert.equal(extractTableNumber("Table 1 to 40", ""), null);
});

test("location remains attached to a new order and payment is independent", () => {
  const a = business("Hotel C");
  const location = db.createServiceLocation(a.id, { label: "Poolside 01" });
  const product = db.createProduct(a.id, { name: "Soda", price: 100, stockQty: 5 });
  const order = db.mutate((state) => db.createOrder(state, {
    businessId: a.id, customerId: "customer-1", serviceLocationId: location.id,
    items: [{ productId: product.id, quantity: 1 }],
  }));
  assert.equal(order.serviceLocationSnapshot.label, "Poolside 01");
  assert.equal(order.fulfillmentStatus, "NEW");
  assert.equal(order.paymentStatus, "PENDING");
  const paid = db.updateOrderStatus(order.id, "ACCEPTED");
  assert.equal(paid.paymentStatus, "PENDING");
  const settled = db.updateOrderStatus(order.id, "READY", { paymentMethod: "counter", paymentRef: "R-1" });
  assert.equal(settled.paymentStatus, "PAID");
  assert.equal(settled.fulfillmentStatus, "ACCEPTED");
});

test("knowledge extraction is a review-only preview and tenant scoped", () => {
  const a = business("Hotel Extract A");
  const b = business("Hotel Extract B");
  const preview = merchantIntelligence.knowledge.extract({
    params: { businessId: a.id },
    session: { businessId: a.id },
    body: {
      fileName: "brochure.txt",
      mimeType: "text/plain",
      base64: Buffer.from("Breakfast served daily.\u0000").toString("base64"),
    },
  });
  assert.equal(preview.fileName, "brochure.txt");
  assert.match(preview.text, /Breakfast served/);
  assert.match(preview.warnings.join(" "), /Preview only/);
  assert.equal(db.listKnowledgeEntries(a.id).some((entry) => entry.text.includes("Breakfast")), false);
  assert.throws(() => merchantIntelligence.knowledge.extract({
    params: { businessId: a.id },
    session: { businessId: b.id },
    body: { fileName: "x.txt", mimeType: "text/plain", base64: Buffer.from("private").toString("base64") },
  }), /authorized|business/i);
});

test("knowledge extraction rejects unsupported and image-only uploads", () => {
  const a = business("Hotel Extract C");
  assert.throws(() => merchantIntelligence.knowledge.extract({
    params: { businessId: a.id }, session: { businessId: a.id },
    body: { fileName: "scan.png", mimeType: "image/png", base64: Buffer.from("image").toString("base64") },
  }), /Supported uploads/i);
  assert.throws(() => merchantIntelligence.knowledge.extract({
    params: { businessId: a.id }, session: { businessId: a.id },
    body: { fileName: "scan.pdf", mimeType: "application/pdf", base64: Buffer.from("not a pdf").toString("base64") },
  }), /PDF|text document/i);
});

test("payment can settle before service and does not complete fulfillment", () => {
  const a = business("Hotel Payment Order");
  const product = db.createProduct(a.id, { name: "Tea", price: 50, stockQty: 3 });
  const order = db.mutate((state) => db.createOrder(state, {
    businessId: a.id, customerId: "customer-payment",
    items: [{ productId: product.id, quantity: 1 }],
  }));
  const paid = db.updateOrderStatus(order.id, "paid", { paymentMethod: "mpesa", mpesaTxnId: "TX-1" });
  assert.equal(paid.paymentStatus, "PAID");
  assert.equal(paid.fulfillmentStatus, "NEW");
  assert.equal(paid.paymentMeta.mpesaTxnId, "TX-1");
  const served = db.updateOrderStatus(order.id, "ACCEPTED");
  assert.equal(served.fulfillmentStatus, "ACCEPTED");
});

test("invalid location token is explicit and a new location changes the conversation context", async () => {
  const a = business("Hotel Location Order");
  const first = db.createServiceLocation(a.id, { label: "Table 1" });
  const second = db.createServiceLocation(a.id, { label: "Table 2" });
  const invalid = await handleCustomerMessage({
    business: a, customerPhone: "254799000001", channel: "simulator",
    text: "hi", serviceLocationToken: "invalid-token-that-is-long-enough-123456",
  });
  assert.match(invalid.replyText, /no longer available/i);
  const initial = await handleCustomerMessage({
    business: a, customerPhone: "254799000002", channel: "simulator",
    text: "hi, i'd like to shop", serviceLocationToken: first.publicToken,
  });
  assert.match(initial.replyText, /Table 1/);
  const moved = await handleCustomerMessage({
    business: a, customerPhone: "254799000002", channel: "simulator",
    text: "hi, i'd like to shop", serviceLocationToken: second.publicToken,
  });
  assert.match(moved.replyText, /Table 2/);
});

test("public location resolve is minimal and requires a real configured WhatsApp number", () => {
  const a = business("Hotel Public Resolve");
  const location = db.createServiceLocation(a.id, { label: "Table Public" });
  assert.throws(() => merchantIntelligence.locations.resolve({ params: { token: location.publicToken } }), /not currently available/i);
  db.mutate((state) => {
    const item = state.businesses.find((entry) => entry.id === a.id);
    item.whatsappNumber = "254700123456";
    item.whatsappPhoneNumberId = "phone-id";
    item.whatsappAccessTokenEnc = "configured";
  });
  const resolved = merchantIntelligence.locations.resolve({ params: { token: location.publicToken } });
  assert.deepEqual(resolved.business, { name: a.name, whatsappPhone: "254700123456", whatsappConnected: true });
  assert.deepEqual(resolved.location, { label: "Table Public", kind: "TABLE" });
});

test("empty labels and duplicate locations are rejected, and 1.5 MiB uploads are accepted by extractor", () => {
  const a = business("Hotel Validation");
  assert.throws(() => db.createKnowledgeEntry(a.id, { title: " ", text: "facts" }), /required/i);
  assert.throws(() => db.createServiceLocation(a.id, { label: " " }), /label/i);
  db.createServiceLocation(a.id, { label: "Lobby" });
  assert.throws(() => db.createServiceLocation(a.id, { label: " lobby " }), /already exists/i);
  const bytes = Buffer.alloc(1.5 * 1024 * 1024, 65);
  const preview = merchantIntelligence.knowledge.extract({
    params: { businessId: a.id }, session: { businessId: a.id },
    body: { fileName: "large.txt", mimeType: "text/plain", base64: bytes.toString("base64") },
  });
  assert.equal(preview.fileName, "large.txt");
  assert.ok(preview.text.length <= 100000);
});

test("location persists across WhatsApp-style turns and order tool use", async () => {
  const a = business("Hotel Multi Turn");
  const location = db.createServiceLocation(a.id, { label: "Table 12" });
  db.createProduct(a.id, { name: "Burger", price: 700, stockQty: 4 });
  await handleCustomerMessage({
    business: a, customerPhone: "254799000003", channel: "whatsapp",
    text: "hi, i'd like to shop", serviceLocationToken: location.publicToken,
  });
  const result = await handleCustomerMessage({
    business: a, customerPhone: "254799000003", channel: "whatsapp",
    text: "order: Burger x1",
  });
  assert.equal(result.order.serviceLocationId, location.id);
  assert.equal(result.order.serviceLocationSnapshot.label, "Table 12");
});

test("table QR entry sends the hotel concierge list and later orders retain the table", async () => {
  const a = business("SKYVIEW OPAL HOTEL");
  a.welcomeMessage = "WELCOME TO SKYVIEW OPAL HOTEL";
  const location = db.createServiceLocation(a.id, { kind: "TABLE", label: "Table 12" });
  db.createProduct(a.id, { name: "Tea", price: 150, stockQty: 5 });

  const greeting = await handleCustomerMessage({
    business: a,
    customerPhone: "254799000012",
    customerName: "Guest",
    channel: "whatsapp",
    text: `Hi, I'm at ${location.label} (location=${location.publicToken}) and I would like to order.`,
    serviceLocationToken: location.publicToken,
  });

  assert.match(greeting.replyText, /WELCOME TO SKYVIEW OPAL HOTEL/);
  assert.match(greeting.replyText, /table number printed beside you/);
  assert.equal(greeting.interactiveList.rows.length, 6);
  assert.deepEqual(greeting.interactiveList.rows.map((row) => row.title), [
    "Order Food", "Rooms", "Swimming Pool", "Conferences", "Events", "Hotel Information",
  ]);
  assert.equal(greeting.conversation.serviceLocationId, location.id);
  assert.match(getConciergePrompt("concierge:food"), /complete current food and drinks menu/i);
  const listPayload = buildWhatsAppListPayload("254799000012", buildConciergeList(a.name));
  assert.equal(listPayload.type, "interactive");
  assert.equal(listPayload.interactive.type, "list");
  assert.equal(listPayload.interactive.action.sections[0].rows.length, 6);

  const order = await handleCustomerMessage({
    business: a,
    customerPhone: "254799000012",
    customerName: "Guest",
    channel: "whatsapp",
    text: "order: Tea x1",
  });
  assert.equal(order.order.serviceLocationId, location.id);
  assert.equal(order.order.serviceLocationSnapshot.label, "Table 12");
});

test("Skyview's direct WhatsApp QR opens the concierge list before any AI catalog reply", async () => {
  const a = business("SKYVIEW OPAL HOTEL");
  const qrText = db.generateShopEntryPrompt("Skyview Opal Hotel");
  const customerPhone = "254799000015";
  const firstScan = await handleCustomerMessage({
    business: a,
    customerPhone,
    customerName: "Guest",
    channel: "whatsapp",
    text: qrText,
  });

  assert.match(firstScan.welcomeText, /WELCOME TO SKYVIEW OPAL HOTEL/);
  assert.equal(firstScan.interactiveList.button, "Explore services");
  assert.deepEqual(firstScan.interactiveList.rows.map((row) => row.title), [
    "Order Food", "Rooms", "Swimming Pool", "Conferences", "Events", "Hotel Information",
  ]);
  const qrListPayload = buildWhatsAppListPayload("254799000015", firstScan.interactiveList);
  assert.equal(qrListPayload.interactive.action.button, "Explore services");
  assert.equal(qrListPayload.interactive.footer.text, "Hotel will confirm rates, hours, and booking slots.");
  assert.ok(qrListPayload.interactive.footer.text.length <= 60);
  assert.equal(firstScan.assistantReplyText, null);
  assert.equal(firstScan.extraReplies, undefined);

  // Re-scanning the hotel's QR in an existing conversation still opens the list.
  const rescan = await handleCustomerMessage({
    business: a,
    customerPhone,
    customerName: "Guest",
    channel: "whatsapp",
    text: qrText,
  });
  assert.equal(rescan.interactiveList.rows.length, 6);
  assert.equal(rescan.extraReplies, undefined);
});

test("guests can confirm a table by typing it after scanning or in an existing chat", async () => {
  const a = business("SKYVIEW OPAL HOTEL Table Confirmation");
  const location = db.createServiceLocation(a.id, { kind: "TABLE", label: "Table 12" });

  const typedTable = await handleCustomerMessage({
    business: a,
    customerPhone: "254799000013",
    channel: "whatsapp",
    text: "I'm seated at table 12.",
  });
  assert.equal(typedTable.conversation.serviceLocationId, location.id);
  assert.match(typedTable.welcomeText, /table number printed beside you/);

  const phone = "254799000014";
  const existingChat = await handleCustomerMessage({
    business: a,
    customerPhone: phone,
    channel: "whatsapp",
    text: "Hello",
  });
  db.mutate((state) => {
    db.addMessage(state, existingChat.conversation.id, "assistant", "Just in case, please tell me the table number printed beside you.");
  });
  const numericTable = await handleCustomerMessage({
    business: a,
    customerPhone: phone,
    channel: "whatsapp",
    text: "12",
  });
  assert.equal(numericTable.conversation.serviceLocationId, location.id);
});

test("unauthenticated C2B cannot auto-settle a location-bound order", async () => {
  const a = business("Hotel C2B Safety");
  db.mutate((state) => {
    const item = state.businesses.find((entry) => entry.id === a.id);
    item.paybillNumber = "411122";
  });
  const location = db.createServiceLocation(a.id, { label: "Table C2B" });
  const product = db.createProduct(a.id, { name: "Juice", price: 120, stockQty: 2 });
  const customer = db.mutate((state) => db.findOrCreateCustomer(state, a.id, "254799000004", "Guest"));
  const order = db.mutate((state) => db.createOrder(state, {
    businessId: a.id, customerId: customer.id, serviceLocationId: location.id,
    items: [{ productId: product.id, quantity: 1 }],
  }));
  await mpesa.handleC2BConfirmation({
    BusinessShortCode: "411122", TransAmount: "120", MSISDN: "254799000004",
    BillRefNumber: order.id.slice(0, 8), TransID: "C2B-BOUND-1",
  });
  assert.equal(db.getOrder(order.id).paymentStatus, "PENDING");
  assert.equal(db.getOrder(order.id).fulfillmentStatus, "NEW");
});

test("knowledge retrieval selects a relevant late section across full approved text without crossing tenants", () => {
  const a = business("Hotel Retrieval A");
  const b = business("Hotel Retrieval B");
  const longText = `${"general brochure text ".repeat(2500)}\nLate checkout policy: guests may request checkout at 14:00 from reception.`;
  db.createKnowledgeEntry(a.id, { title: "Full brochure", category: "policy", text: longText, source: "brochure.pdf" });
  db.createKnowledgeEntry(b.id, { title: "Other hotel", category: "policy", text: "Late checkout is never available.", source: "other.pdf" });
  const result = buildKnowledgeContext(a, "What is the late checkout policy?", []);
  assert.match(result.text, /Late checkout policy/);
  assert.doesNotMatch(result.text, /never available/);
  assert.ok(result.text.length <= 12000);
  assert.throws(() => db.createKnowledgeEntry(a.id, { title: "Too big", text: "x".repeat(100001) }), /100,000/i);
});

test("hotel WhatsApp menu treats active catalog items as available despite stale menu stock warnings", async () => {
  const hotel = business("Hotel Menu Availability");
  const product = db.createProduct(hotel.id, {
    name: "Grilled Fish Fillet",
    category: "food",
    price: 850,
    stockQty: 0,
  });
  db.createKnowledgeEntry(hotel.id, {
    title: "Complete menu",
    category: "menu",
    text: "Items are currently showing as out of stock in our ordering system, but prices are listed for reference.",
    source: "uploaded menu",
  });

  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    if (requests.length === 1) {
      return {
        ok: true,
        json: async () => ({
          stop_reason: "tool_use",
          content: [{
            type: "tool_use",
            id: "search-menu",
            name: "search_products",
            input: { query: "fish" },
          }],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Grilled Fish Fillet is available for KES 850." }],
      }),
    };
  };

  let result;
  try {
    result = await runClaudeAssistant(hotel, "customer-menu-test", [], "Menu");
  } finally {
    global.fetch = originalFetch;
  }

  assert.match(result.replyText, /available/i);
  assert.doesNotMatch(result.replyText, /out of stock|for reference only/i);
  assert.match(requests[0].system, /active product catalog is the source of truth/i);
  assert.match(requests[0].system, /Do not use stock warnings or availability claims in uploaded menus/i);
  assert.match(requests[0].system, /Items are currently showing as out of stock/);

  const toolResult = requests[1].messages.at(-1).content
    .find((message) => message.type === "tool_result");
  const catalogResult = JSON.parse(toolResult.content);
  assert.deepEqual(catalogResult.results.map(({ name, price, stockQty, availability }) => ({
    name, price, stockQty, availability,
  })), [{
    name: product.name,
    price: product.price,
    stockQty: null,
    availability: "available",
  }]);
});

test("hotel menu and Order Food selection reply only with active catalog names and prices", async () => {
  const hotel = business("Hotel Fast Menu");
  hotel.welcomeMessage = "Welcome to Hotel Fast Menu.";
  const fish = db.createProduct(hotel.id, { name: "Grilled Fish Fillet", category: "food", price: 850, stockQty: 0 });
  db.createProduct(hotel.id, { name: "Fresh Juice", category: "drinks", price: 250, stockQty: 4 });
  db.createProduct(hotel.id, { name: "Garden Suite", category: "other", price: 18000, stockQty: 0 });
  db.createProduct(hotel.id, { name: "Swimming Pool Access", price: 500, stockQty: 0 });
  const inactive = db.createProduct(hotel.id, { name: "Archived Special", category: "food", price: 999, stockQty: 0 });
  db.updateProduct(hotel.id, inactive.id, { active: false });
  db.createKnowledgeEntry(hotel.id, {
    title: "Old menu",
    category: "menu",
    text: "Lobster Thermidor — KES 9,999. Items are out of stock and prices are for reference only.",
    source: "old menu",
  });

  const menu = await handleCustomerMessage({
    business: hotel,
    customerPhone: "254799000021",
    customerName: "Guest",
    channel: "whatsapp",
    text: "Menu",
  });
  assert.match(menu.replyText, /Welcome to Hotel Fast Menu\.\n\n📋 \*MENU\*/);
  assert.equal((menu.replyText.match(/\bwelcome\b/gi) || []).length, 1);
  assert.match(menu.replyText, /🍽️ \*FOOD\*/);
  assert.match(menu.replyText, /\*Seafood\*/);
  assert.match(menu.replyText, /Grilled Fish Fillet — KES 850/);
  assert.match(menu.replyText, /🥤 \*DRINKS\*/);
  assert.match(menu.replyText, /🥤 \*DRINKS\*\n\n• Fresh Juice — KES 250/);
  assert.match(menu.replyText, /Fresh Juice — KES 250/);
  assert.equal((menu.replyText.match(/to order/gi) || []).length, 1);
  assert.match(menu.replyText, /For dine-in, send your table number \(1–40\) by itself first\./);
  assert.doesNotMatch(menu.replyText, /Welcome to our Food & Drinks menu|Other Food Items|Other Drinks/);
  assert.doesNotMatch(menu.replyText, /Garden Suite|Swimming Pool Access|Archived Special|Lobster Thermidor|out of stock|reference only|mock AI/i);

  const orderFood = await handleCustomerMessage({
    business: hotel,
    customerPhone: "254799000022",
    customerName: "Guest",
    channel: "whatsapp",
    text: getConciergePrompt("concierge:food"),
  });
  assert.match(orderFood.replyText, /Grilled Fish Fillet — KES 850/);
  assert.match(orderFood.replyText, /Fresh Juice — KES 250/);
  assert.match(orderFood.replyText, /send the item name and quantity/i);
  assert.doesNotMatch(orderFood.replyText, /Garden Suite|Swimming Pool Access|Archived Special|Lobster Thermidor|out of stock|reference only|mock AI/i);
  assert.equal(fish.stockQty, 0);
});

test("Skyview menu category migration assigns the approved Food and Drinks list once without changing stock or prices", async () => {
  assert.equal(hospitalityMenu.HOTEL_MENU_CATEGORY_ITEMS.length, 63);
  assert.equal(hospitalityMenu.getHotelMenuClassification("  GRILLED fish-filLET ")?.category, "food");
  assert.equal(hospitalityMenu.getHotelMenuClassification("Vanilla Iced Latte")?.category, "drinks");
  assert.equal(hospitalityMenu.getHotelMenuClassification("Low Fat Milk"), null);

  db.mutate((state) => {
    for (const key of Object.keys(state)) {
      if (Array.isArray(state[key])) state[key] = [];
    }
    state.migrations = {};
  });

  const hotel = business("Skyview Opal Hotel");
  const fish = db.createProduct(hotel.id, { name: "Grilled Fish Fillet", price: 850, stockQty: 7 });
  const icedCoffee = db.createProduct(hotel.id, { name: "Vanilla Iced Latte", category: "other", price: 400, stockQty: 3 });
  const room = db.createProduct(hotel.id, { name: "Garden Suite", price: 18000, stockQty: 0 });
  const archived = db.createProduct(hotel.id, { name: "Beef Stew", price: 800, stockQty: 2 });
  db.updateProduct(hotel.id, archived.id, { active: false });

  const otherHotel = business("Other Hotel");
  const otherFish = db.createProduct(otherHotel.id, { name: "Grilled Fish Fillet", price: 900, stockQty: 5 });

  const migration = db.runOneTimeHotelMenuCategoryMigration({
    businessName: "Skyview Opal Hotel",
    migrationId: "test-skyview-food-drinks-categories",
  });
  assert.equal(migration.applied, true);
  assert.equal(migration.matchedProducts, 3);
  assert.equal(migration.updatedProducts, 3);
  assert.deepEqual(migration.categoryCounts, { food: 2, drinks: 1 });
  assert.ok(migration.unmatchedMenuItemCount > 0);

  assert.equal(db.getProduct(fish.id).category, "food");
  assert.equal(db.getProduct(icedCoffee.id).category, "drinks");
  assert.equal(db.getProduct(room.id).category, null);
  assert.equal(db.getProduct(archived.id).category, "food");
  assert.equal(db.getProduct(otherFish.id).category, null);
  assert.equal(db.getProduct(fish.id).price, 850);
  assert.equal(db.getProduct(fish.id).stockQty, 7);
  assert.equal(db.getProduct(fish.id).active, true);
  assert.equal(db.getProduct(archived.id).active, false);

  const repeatedMigration = db.runOneTimeHotelMenuCategoryMigration({
    businessName: "Skyview Opal Hotel",
    migrationId: "test-skyview-food-drinks-categories",
  });
  assert.equal(repeatedMigration.reason, "already-applied");

  const menu = await handleCustomerMessage({
    business: hotel,
    customerPhone: "254799000099",
    customerName: "Guest",
    channel: "whatsapp",
    text: "Menu",
  });
  assert.match(menu.replyText, /✅ All shown items are available\./);
  assert.match(menu.replyText, /\*Seafood\*/);
  assert.match(menu.replyText, /Grilled Fish Fillet — KES 850/);
  assert.match(menu.replyText, /\*Iced Coffee\*/);
  assert.match(menu.replyText, /Vanilla Iced Latte — KES 400/);
  assert.doesNotMatch(menu.replyText, /Garden Suite|Beef Stew|Low Fat Milk/);
  assert.match(menu.replyText, /\*To order:\* Send the item name and quantity\./i);
});