const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-si-ai-usage-"));
process.env.DATA_DIR = dataDir;
process.env.ANTHROPIC_API_KEY = "unit-test-only";

const db = require("../db");
const auth = require("../auth");
const aiUsageRoute = require("./ai-usage");
const { runClaudeAssistant } = require("../ai");

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

function createBusiness(name) {
  return db.mutate((state) => db.createBusiness(state, {
    name,
    category: "Retail",
    merchantType: "retail",
    phone: name === "Usage Owner" ? "254711111101" : "254711111102",
    personalPhone: name === "Usage Owner" ? "254711111101" : "254711111102",
    pesaAiNumber: name === "Usage Owner" ? "254722222201" : "254722222202",
  }));
}

test("owner usage endpoint returns aggregated provider tokens and estimated spend", async () => {
  const business = createBusiness("Usage Owner");
  const otherBusiness = createBusiness("Other Usage Owner");
  const originalFetch = global.fetch;
  let sentBody;
  global.fetch = async (_url, options) => {
    sentBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "I can help with that." }],
        usage: {
          input_tokens: 123,
          output_tokens: 45,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      }),
    };
  };

  try {
    const result = await runClaudeAssistant(business, "customer-test-id", [], "Hello");
    assert.equal(result.replyText, "I can help with that.");
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(sentBody.max_tokens, 768);
  const summary = aiUsageRoute.get({
    params: { businessId: business.id },
    session: { businessId: business.id },
  });
  assert.equal(summary.requestCount, 1);
  assert.equal(summary.inputTokens, 123);
  assert.equal(summary.outputTokens, 45);
  assert.equal(summary.totalTokens, 168);
  assert.equal(summary.estimatedSpendUsd, 0.001044);
  assert.equal(summary.unpricedRequestCount, 0);
  assert.equal(summary.daily.length, 1);
  assert.deepEqual(summary.models, ["claude-sonnet-4-5-20250929"]);

  assert.throws(
    () => aiUsageRoute.get({
      params: { businessId: otherBusiness.id },
      session: { businessId: business.id },
    }),
    (error) => error.statusCode === 403
  );
});
