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