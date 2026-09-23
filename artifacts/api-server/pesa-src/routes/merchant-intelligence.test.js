const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-si-intelligence-"));
process.env.DATA_DIR = dataDir;
const db = require("../db");
const merchantIntelligence = require("./merchant-intelligence");
const { handleCustomerMessage } = require("../core");
const mpesa = require("../mpesa");
const { buildKnowledgeContext } = require("../ai");

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