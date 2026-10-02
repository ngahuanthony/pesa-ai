const test = require("node:test");
const assert = require("node:assert/strict");
const whatsapp = require("../whatsapp");

test("long WhatsApp text replies are sent in ordered, valid-size messages", async () => {
  const originalFetch = global.fetch;
  const sentBodies = [];
  global.fetch = async (_url, options) => {
    sentBodies.push(JSON.parse(options.body).text.body);
    return { ok: true };
  };

  try {
    const menu = Array.from(
      { length: 220 },
      (_, index) => `🍵 Menu item ${index + 1} — KSh 850`
    ).join("\n");
    const sent = await whatsapp.sendMessage("phone-id", "254700000000", menu, "test-token");

    assert.equal(sent, true);
    assert.ok(sentBodies.length > 1);
    assert.ok(sentBodies.every((body) => body.length <= 4000));
    assert.equal(sentBodies.join(""), menu);
  } finally {
    global.fetch = originalFetch;
  }
});

test("a failed long-reply chunk stops further WhatsApp sends", async () => {
  const originalFetch = global.fetch;
  let requests = 0;
  global.fetch = async () => {
    requests += 1;
    return {
      ok: false,
      status: 400,
      text: async () => "rejected",
    };
  };

  try {
    const sent = await whatsapp.sendMessage(
      "phone-id",
      "254700000000",
      "x".repeat(8001),
      "test-token"
    );
    assert.equal(sent, false);
    assert.equal(requests, 1);
  } finally {
    global.fetch = originalFetch;
  }
});