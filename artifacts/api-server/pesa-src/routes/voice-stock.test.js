const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-voice-stock-"));
const db = require("../db");
const voiceStock = require("./voice-stock");

function fixture() {
  const state = {
    businesses: [
      { id: "business-a", name: "A", phone: "a", category: "shop" },
      { id: "business-b", name: "B", phone: "b", category: "shop" },
    ],
    products: [
    { id: "tea-a", businessId: "business-a", name: "Kenyan Tea", stockQty: 10 },
    { id: "milk-a", businessId: "business-a", name: "Milk", stockQty: 10 },
    { id: "bread-a", businessId: "business-a", name: "Bread", stockQty: 10 },
    { id: "cable-a", businessId: "business-a", name: "Oraimo Cable", stockQty: 0 },
    { id: "tea-b", businessId: "business-b", name: "Kenyan Tea", stockQty: 20 }
    ],
    stockMovements: [],
  };
  fs.writeFileSync(db.DATA_FILE, JSON.stringify(state));
}

function session(businessId) {
  return { businessId, accountId: "account-" + businessId };
}

test.beforeEach(fixture);

test("interpret does not mutate stock", async () => {
  const result = await voiceStock.interpret({
    params: { businessId: "business-a" }, session: session("business-a"),
    body: { transcript: "received 5 Kenyan Tea" },
  });
  assert.equal(result.items[0].productId, "tea-a");
  assert.equal(db.getProduct("tea-a").stockQty, 10);
});

test("fallback separates mixed English and Kiswahili stock actions", async () => {
  const english = await voiceStock.interpret({
    params: { businessId: "business-a" }, session: session("business-a"),
    body: { transcript: "received 24 packets of milk and sold 3 loaves of bread" },
  });
  assert.deepEqual(english.items.map((item) => [item.productId, item.action, item.quantity]), [
    ["milk-a", "receive", 24], ["bread-a", "sell", 3],
  ]);
  const kiswahili = await voiceStock.interpret({
    params: { businessId: "business-a" }, session: session("business-a"),
    body: { transcript: "nimepokea 6 maziwa na nimeuza 2 mkate" },
  });
  assert.deepEqual(kiswahili.items.map((item) => [item.productId, item.action, item.quantity]), [
    ["milk-a", "receive", 6], ["bread-a", "sell", 2],
  ]);
});

test("confirmation changes only products in the authenticated business", () => {
  assert.throws(() => voiceStock.confirm({
    params: { businessId: "business-a" }, session: session("business-a"),
    body: { items: [{ productId: "tea-b", action: "sell", quantity: 2 }] },
  }), { message: /does not belong/ });
  const result = voiceStock.confirm({
    params: { businessId: "business-a" }, session: session("business-a"),
    body: { transcript: "sold 2 tea", items: [{ productId: "tea-a", action: "sell", quantity: 2, unit: "units" }] },
  });
  assert.equal(result.products[0].stockQty, 8);
  assert.equal(db.getProduct("tea-b").stockQty, 20);
});

test("confirmation rejects negative stock", () => {
  assert.throws(() => voiceStock.confirm({
    params: { businessId: "business-a" }, session: session("business-a"),
    body: { items: [{ productId: "tea-a", action: "sell", quantity: 11 }] },
  }), { message: /cannot become negative/ });
  assert.equal(db.getProduct("tea-a").stockQty, 10);
});

test("adjustment sets counted stock and stages repeated product changes", () => {
  const result = voiceStock.confirm({
    params: { businessId: "business-a" }, session: session("business-a"),
    body: { items: [
      { productId: "tea-a", action: "adjustment", quantity: 4 },
      { productId: "tea-a", action: "sell", quantity: 3 },
    ] },
  });
  assert.equal(db.getProduct("tea-a").stockQty, 1);
  assert.deepEqual(result.movements.map((movement) => [movement.previousStock, movement.delta, movement.resultingStock]), [
    [10, -6, 4], [4, -3, 1],
  ]);
});

test("history is scoped to the requested business", () => {
  db.confirmStockMovements("business-a", [{ productId: "tea-a", action: "receive", quantity: 1 }]);
  db.confirmStockMovements("business-b", [{ productId: "tea-b", action: "receive", quantity: 1 }]);
  const result = voiceStock.history({
    params: { businessId: "business-a" }, session: session("business-a"), query: {},
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].businessId, "business-a");
});

test("interpret preserves quantities per colour and ignores the spoken total", async () => {
  const result = await voiceStock.interpret({
    params: { businessId: "business-a" }, session: session("business-a"),
    body: { transcript: "received Oraimo Cable, black 20 pieces, white 15 pieces and blue 20 pieces, total 55" },
  });
  assert.deepEqual(result.items.map((item) => [item.productId, item.action, item.color, item.quantity]), [
    ["cable-a", "receive", "black", 20],
    ["cable-a", "receive", "white", 15],
    ["cable-a", "receive", "blue", 20],
  ]);
  assert.equal(db.getProduct("cable-a").stockQty, 0);
});

test("confirmation stores colour quantities and derives the aggregate total", () => {
  const result = voiceStock.confirm({
    params: { businessId: "business-a" }, session: session("business-a"),
    body: { transcript: "black 20 white 15 blue 20", items: [
      { productId: "cable-a", action: "receive", color: "Black", quantity: 20, unit: "pcs" },
      { productId: "cable-a", action: "receive", color: "White", quantity: 15, unit: "pcs" },
      { productId: "cable-a", action: "receive", color: "Blue", quantity: 20, unit: "pcs" },
    ] },
  });
  assert.equal(result.products[0].stockQty, 55);
  assert.deepEqual(db.getProduct("cable-a").colorStock, [
    { color: "Black", quantity: 20 },
    { color: "White", quantity: 15 },
    { color: "Blue", quantity: 20 },
  ]);
  assert.deepEqual(result.movements.map((movement) => movement.resultingStock), [20, 35, 55]);
});

test("colour stock cannot become negative and confirmation stays atomic", () => {
  db.confirmStockMovements("business-a", [
    { productId: "cable-a", action: "receive", color: "Black", quantity: 4 },
  ]);
  assert.throws(() => voiceStock.confirm({
    params: { businessId: "business-a" }, session: session("business-a"),
    body: { items: [
      { productId: "cable-a", action: "receive", color: "Blue", quantity: 3 },
      { productId: "cable-a", action: "sell", color: "Black", quantity: 5 },
    ] },
  }), { message: /cannot become negative/ });
  assert.equal(db.getProduct("cable-a").stockQty, 4);
  assert.deepEqual(db.getProduct("cable-a").colorStock, [{ color: "Black", quantity: 4 }]);
});

test("confirmation saves one overwritable image URL per colour variant", () => {
  const first = voiceStock.confirm({
    params: { businessId: "business-a" }, session: session("business-a"),
    body: { items: [{ productId: "cable-a", action: "receive", color: "Black", quantity: 4, imageUrl: "https://images.example/black-old.webp" }] },
  });
  assert.equal(first.products[0].colorStock[0].imageUrl, "https://images.example/black-old.webp");

  const second = voiceStock.confirm({
    params: { businessId: "business-a" }, session: session("business-a"),
    body: { items: [{ productId: "cable-a", action: "adjustment", color: "Black", quantity: 7, imageUrl: "https://images.example/black-new.webp" }] },
  });
  assert.deepEqual(db.getProduct("cable-a").colorStock, [
    { color: "Black", quantity: 7, imageUrl: "https://images.example/black-new.webp" },
  ]);
  assert.equal(second.movements[0].colorResultingStock, 7);
});

test("variant image upload returns the deterministic public URL", async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://demo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  global.fetch = async (url, options) => {
    assert.match(url, /\/storage\/v1\/object\/product-images\/business-a\/tea-a_black\.webp$/);
    assert.equal(options.method, "POST");
    assert.equal(options.headers["x-upsert"], "true");
    return { ok: true, text: async () => "" };
  };
  try {
    const result = await voiceStock.uploadVariantImage({
      params: { businessId: "business-a" },
      query: { productId: "tea-a", color: "Black" },
      body: Buffer.alloc(200, 1),
      contentType: "image/webp",
      session: session("business-a"),
    });
    assert.equal(result.imageUrl, "https://demo.supabase.co/storage/v1/object/public/product-images/business-a/tea-a_black.webp");
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
const { normalizeTranscript } = require("../transcriptNormalizer");
const { fallbackInterpret } = require("../universalParser");
test("normalizes Swahili, Sheng, and common ASR variants", () => {
  assert.equal(normalizeTranscript("Samsung fold five Five black pieces five green pieces five block pieces"), "samsung fold 5 5 black pieces 5 green pieces 5 black pieces");
  assert.equal(normalizeTranscript("Shati tano nyeusi size L"), "shirt 5 black size l");
});

test("universal parser separates similar phone models and repeated colour variants", () => {
  const business = { id: "phones", category: "phone_accessories" };
  const products = [
    { id: "fold-5", businessId: "phones", name: "Samsung Fold 5", stockQty: 0 },
    { id: "fold-6", businessId: "phones", name: "Samsung Fold 6", stockQty: 0 },
  ];
  const items = fallbackInterpret(
    "Samsung fold five black 5 green 5 block 5 fold six blue 10",
    business,
    products,
  );
  assert.deepEqual(items.map((item) => [item.productId, item.color, item.quantity, item.action]), [
    ["fold-5", "black", 5, "receive"],
    ["fold-5", "green", 5, "receive"],
    ["fold-5", "black", 5, "receive"],
    ["fold-6", "blue", 10, "receive"],
  ]);
  assert.ok(items.every((item) => item.confidenceLevel !== "blocked"));
});

test("universal parser applies category-specific size and unit attributes", () => {
  const mitumba = fallbackInterpret(
    "Shati tano nyeusi size L",
    { id: "clothes", category: "mitumba" },
    [{ id: "shirt", businessId: "clothes", name: "Shati", stockQty: 2 }],
  );
  assert.deepEqual(
    [mitumba[0].productId, mitumba[0].color, mitumba[0].quantity, mitumba[0].size],
    ["shirt", "black", 5, "L"],
  );

  const hardware = fallbackInterpret(
    "Misumari kg tano inch mbili",
    { id: "hardware", category: "hardware" },
    [{ id: "nails", businessId: "hardware", name: "Misumari", stockQty: 10 }],
  );
  assert.deepEqual(
    [hardware[0].productId, hardware[0].quantity, hardware[0].unit, hardware[0].size],
    ["nails", 5, "kg", "2 inch"],
  );
});

test("confirmation request IDs prevent duplicate stock updates", () => {
  const first = db.confirmStockMovements("business-a", [
    { productId: "milk-a", action: "receive", quantity: 5, unit: "packets" },
  ], { requestId: "voice-request-1", accountId: "account-business-a" });
  const repeated = db.confirmStockMovements("business-a", [
    { productId: "milk-a", action: "receive", quantity: 5, unit: "packets" },
  ], { requestId: "voice-request-1", accountId: "account-business-a" });
  assert.equal(first.duplicate, undefined);
  assert.equal(repeated.duplicate, true);
  assert.equal(db.getProduct("milk-a").stockQty, 15);
});
