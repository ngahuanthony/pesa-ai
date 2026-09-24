const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-platform-daraja-"));
process.env.ENCRYPTION_KEY = "b".repeat(64);
process.env.PUBLIC_BASE_URL = "https://example.test";
const db = require("../db");
const merchant = require("./mpesaSettings");
const admin = require("./admin");
const mpesa = require("../mpesa");

function business(name) {
  return db.mutate((state) => db.createBusiness(state, {
    name, category: "Retail", phone: `2547${Math.floor(Math.random() * 90000000 + 10000000)}`,
  }));
}

test("merchant submits only receiving details; admin owns app and shortcode passkey", async () => {
  const first = business("Receiving A");
  const second = business("Receiving B");
  const owner = { businessId: first.id, accountId: "owner" };
  const staff = { isAdmin: true };
  // Subscription gate stays in place for the merchant.
  db.mutate((state) => {
    const subscription = state.subscriptions.find((s) => s.businessId === first.id);
    subscription.plan = "business";
  });
  await assert.rejects(merchant.connect({ params: { businessId: first.id }, session: owner, body: { method: "till", tillNumber: "123456", consumerSecret: "leaked" } }), /administrators/);
  await assert.rejects(merchant.connect({ params: { businessId: second.id }, session: owner, body: { method: "till", tillNumber: "123456" } }), /authorized|business/i);
  const saved = await merchant.connect({ params: { businessId: first.id }, session: owner, body: { method: "till", tillNumber: "123456" } });
  assert.equal(saved.data.verified, false);
  assert.equal(db.getMpesaCredentialsDecrypted(first.id), null);
  assert.equal(db.getMpesaStatus(first.id).connected, true);

  admin.setPlatformDaraja({ session: staff, body: { consumerKey: "shared-key", consumerSecret: "shared-secret" } });
  assert.equal(admin.getPlatformDaraja({ session: staff }).configured, true);
  assert.equal(JSON.stringify(db.sanitizeBusiness(db.getBusiness(first.id))).includes("passkeyEnc"), false);
  assert.equal(JSON.stringify(db.load().platformDaraja).includes("shared-secret"), false);
  assert.throws(() => admin.setPlatformDaraja({ session: owner, body: { consumerKey: "other", consumerSecret: "other" } }), /admin/i);
  await assert.rejects(admin.verifyMpesa({ session: staff, params: { businessId: first.id }, body: {} }), /Confirm Safaricom/);

  admin.setMpesaCredentials({ session: staff, params: { businessId: first.id }, body: { passkey: "shortcode-one-passkey" } });
  assert.equal(db.getMpesaStatus(first.id).passkeyConfigured, true);
  assert.equal(JSON.stringify(db.sanitizeBusiness(db.getBusiness(first.id))).includes("shortcode-one-passkey"), false);
  assert.equal(db.getMpesaCredentialsDecrypted(first.id).consumerKey, "shared-key");
  assert.equal(db.getMpesaCredentialsDecrypted(first.id).passkey, "shortcode-one-passkey");

  const oldFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    if (String(url).includes("/oauth/")) return { ok: true, json: async () => ({ access_token: "test-token" }) };
    return { ok: true, json: async () => ({ ResponseCode: "0", CheckoutRequestID: "test-checkout" }) };
  };
  try {
    const verified = await admin.verifyMpesa({ session: staff, params: { businessId: first.id }, body: { receivingAccountAuthorized: true } });
    assert.equal(verified.verified, true);
    const product = db.createProduct(first.id, { name: "Item", price: 100, stockQty: 3 });
    const order = db.mutate((state) => db.createOrder(state, { businessId: first.id, customerId: "customer", items: [{ productId: product.id, quantity: 1 }] }));
    await mpesa.initiateStkPush({ orderId: order.id, phone: "0712345678" });
    const stk = JSON.parse(requests.find((request) => String(request.url).includes("processrequest")).options.body);
    assert.equal(stk.BusinessShortCode, "123456");
    assert.equal(stk.PartyB, "123456");
    assert.equal(stk.TransactionType, "CustomerBuyGoodsOnline");
    const callbackQuery = Object.fromEntries(new URL(stk.CallBackURL).searchParams);
    const callback = { Body: { stkCallback: { CheckoutRequestID: "test-checkout", ResultCode: 0, CallbackMetadata: { Item: [
      { Name: "Amount", Value: 100 }, { Name: "MpesaReceiptNumber", Value: "RECEIPT" },
    ] } } } };
    assert.equal(mpesa.isAuthorizedStkCallback({}, callback), false);
    assert.equal(mpesa.isAuthorizedStkCallback({ ...callbackQuery, signature: "0".repeat(64) }, callback), false);
    assert.equal(mpesa.isAuthorizedStkCallback(callbackQuery, callback), true);

    db.setMpesaReceivingAccount(first.id, { shortcode: "654321", method: "till" }, "owner");
    assert.equal(db.getMpesaStatus(first.id).verified, false);
    assert.equal(db.getMpesaStatus(first.id).passkeyConfigured, false);
    const nextOrder = db.mutate((state) => db.createOrder(state, { businessId: first.id, customerId: "customer", items: [{ productId: product.id, quantity: 1 }] }));
    await assert.rejects(mpesa.initiateStkPush({ orderId: nextOrder.id, phone: "0712345678" }), /awaiting Pesa SI verification|not connected/);
    db.setMpesaReceivingAccount(second.id, { shortcode: "123456", method: "till" }, "admin");
    assert.throws(() => db.setMpesaReceivingAccount(first.id, { shortcode: "123456", method: "till" }, "owner"), /already assigned/);
  } finally {
    global.fetch = oldFetch;
  }
});

test("legacy merchant API credentials are scrubbed without activating payments", () => {
  const old = business("Legacy account");
  db.mutate((state) => {
    const target = state.businesses.find((entry) => entry.id === old.id);
    target.mpesaCredentials = {
      consumerKeyEnc: "old-consumer-key", consumerSecretEnc: "old-consumer-secret",
      passkeyEnc: "old-passkey", shortcode: "432198", verified: true,
    };
    target.mpesa = { method: "paybill", paybillNumber: "432198", verified: true };
  });
  assert.equal(db.getMpesaStatus(old.id).connected, true);
  assert.equal(db.getMpesaStatus(old.id).verified, false);
  assert.equal(db.getMpesaCredentialsDecrypted(old.id), null);
  const raw = fs.readFileSync(db.DATA_FILE, "utf8");
  assert.equal(raw.includes("old-consumer-secret"), false);
  assert.equal(raw.includes("old-passkey"), false);
  assert.equal(db.getBusinessByShortcode("432198"), null);
});

test("bank selection disables merchant STK even if it was verified", () => {
  const account = business("Bank account");
  db.setMpesaReceivingAccount(account.id, { shortcode: "987654", method: "till" }, "admin");
  db.setMerchantStkPasskey(account.id, "test-passkey");
  db.verifyMpesaCredentials(account.id, "admin");
  db.updateBusiness(account.id, { paymentMethod: "bank", bankName: "Test Bank", bankAccountNumber: "12345" }, "owner");
  assert.equal(db.getMpesaStatus(account.id).verified, false);
  assert.equal(db.getBusinessByShortcode("987654"), null);
});

test("admin WhatsApp readiness recognizes the production legacy shared token", () => {
  const keys = [
    "WHATSAPP_PLATFORM_TOKEN", "WHATSAPP_TOKEN",
    "WHATSAPP_PLATFORM_PHONE_NUMBER_ID", "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_PLATFORM_WABA_ID", "WHATSAPP_VERIFY_TOKEN",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    delete process.env.WHATSAPP_PLATFORM_TOKEN;
    process.env.WHATSAPP_TOKEN = "legacy-shared-token-for-test";
    delete process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID;
    process.env.WHATSAPP_PHONE_NUMBER_ID = "sender-123";
    process.env.WHATSAPP_PLATFORM_WABA_ID = "waba-456";
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-token-for-test";
    const defaults = admin.getPlatformDefaults({ session: { isAdmin: true } });
    assert.equal(defaults.hasToken, true);
    assert.equal(defaults.phoneNumberId, "sender-123");
    assert.equal(defaults.wabaId, "waba-456");
    assert.equal(defaults.hasWebhookVerifyToken, true);
    assert.equal(JSON.stringify(defaults).includes("legacy-shared-token-for-test"), false);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("admin WhatsApp activation uses the same legacy token and sender aliases as runtime", async () => {
  const account = business("WhatsApp alias connection");
  const keys = [
    "WHATSAPP_PLATFORM_TOKEN", "WHATSAPP_TOKEN",
    "WHATSAPP_PLATFORM_PHONE_NUMBER_ID", "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_PLATFORM_WABA_ID", "WHATSAPP_VERIFY_TOKEN",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const oldFetch = global.fetch;
  const requests = [];
  try {
    delete process.env.WHATSAPP_PLATFORM_TOKEN;
    process.env.WHATSAPP_TOKEN = "legacy-shared-token-for-test";
    delete process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID;
    process.env.WHATSAPP_PHONE_NUMBER_ID = "sender-123";
    process.env.WHATSAPP_PLATFORM_WABA_ID = "waba-456";
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-token-for-test";
    global.fetch = async (url, options) => {
      requests.push({ url: String(url), authorization: options?.headers?.authorization });
      return { ok: true, text: async () => "" };
    };
    const result = await admin.setWhatsAppCredentials({
      session: { isAdmin: true },
      params: { businessId: account.id },
      body: { displayName: account.name },
    });
    assert.equal(result.connected, true);
    assert.equal(result.connectionStatus, "live");
    assert.equal(db.getWhatsAppStatus(account.id).connected, true);
    assert.equal(requests.length >= 2, true);
    assert.equal(requests.every((request) => request.authorization === "Bearer legacy-shared-token-for-test"), true);
  } finally {
    global.fetch = oldFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("WhatsApp admin status does not label a failed subscription as live", () => {
  const account = business("WhatsApp status");
  db.setWhatsAppCredentials(account.id, {
    phoneNumberId: "sender-status-test",
    accessToken: "encrypted-token-test",
    verifyToken: "verify-test",
    wabaId: "waba-status-test",
    displayName: account.name,
    waPhone: "254700000001",
  });
  db.setWhatsAppConnectionStatus(account.id, "failed", "Meta webhook subscription failed");
  const status = db.getWhatsAppStatus(account.id);
  assert.equal(status.connected, false);
  assert.equal(status.connectionStatus, "failed");
  assert.equal(status.connectionError, "Meta webhook subscription failed");
  assert.equal(db.getVendorWhatsAppStatus(account.id).connected, false);
});