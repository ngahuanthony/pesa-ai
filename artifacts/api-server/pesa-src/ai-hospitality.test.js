const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-ai-hospitality-"));
process.env.ENCRYPTION_KEY = "d".repeat(64);
process.env.ANTHROPIC_API_KEY = "unit-test-anthropic-key";

const db = require("./db");
const ai = require("./ai");

test("assistant treats hospitality availability as menu status and preserves retail stock checks", async () => {
  const restaurant = db.mutate((state) => db.createBusiness(state, {
    name: "Sample Restaurant",
    category: "Restaurant",
    merchantType: "hospitality",
    phone: "254700000001",
    pesaAiNumber: "254700000001",
  }));
  const hotelMenuItem = db.createProduct(restaurant.id, {
    name: "Chicken Pilau",
    price: 650,
    stockQty: 0,
  });

  const retailer = db.mutate((state) => db.createBusiness(state, {
    name: "Sample Duka",
    category: "Retail",
    merchantType: "retail",
    phone: "254700000002",
    pesaAiNumber: "254700000002",
  }));
  const retailItem = db.createProduct(retailer.id, {
    name: "Tea",
    price: 120,
    stockQty: 0,
  });

  const requests = [];
  const oldFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    const response = requests.length % 2 === 1
      ? {
          stop_reason: "tool_use",
          content: [{
            type: "tool_use",
            id: `search-${requests.length}`,
            name: "search_products",
            input: { query: "" },
          }],
        }
      : {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Here are the current options." }],
        };
    return { ok: true, json: async () => response };
  };

  try {
    await ai.getAssistantReply(restaurant, "restaurant-customer", [], "What is on the menu?");
    await ai.getAssistantReply(retailer, "retail-customer", [], "What is in stock?");
  } finally {
    global.fetch = oldFetch;
  }

  assert.equal(requests.length, 4);
  assert.match(requests[0].system, /menu availability/);
  assert.match(requests[0].system, /ignore numeric stock quantities/);
  assert.match(requests[0].system, /Chicken Pilau: KES 650 \(available while on the menu\)/);
  assert.doesNotMatch(requests[0].system, /Chicken Pilau: KES 650 \(out of stock\)/);

  const hospitalityToolResult = JSON.parse(requests[1].messages.at(-1).content[0].content);
  assert.equal(hospitalityToolResult.results[0].name, hotelMenuItem.name);
  assert.equal(hospitalityToolResult.results[0].availability, "available while active on the menu");
  assert.equal("stockQty" in hospitalityToolResult.results[0], false);

  assert.match(requests[2].system, /price\/stock/);
  assert.match(requests[2].system, /Tea: KES 120 \(out of stock\)/);
  const retailToolResult = JSON.parse(requests[3].messages.at(-1).content[0].content);
  assert.equal(retailToolResult.results[0].name, retailItem.name);
  assert.equal(retailToolResult.results[0].stockQty, 0);
  assert.equal("availability" in retailToolResult.results[0], false);
});