const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-meta-signup-"));
const originalEncryptionKey = process.env.ENCRYPTION_KEY;
process.env.ENCRYPTION_KEY = "a".repeat(64);
const db = require("../db");
const authRoutes = require("./auth");
const adminRoutes = require("./admin");
const whatsapp = require("../whatsapp");

const originalWaba = process.env.WHATSAPP_PLATFORM_WABA_ID;
const originalToken = process.env.WHATSAPP_PLATFORM_TOKEN;

test.beforeEach(() => {
  db.mutate((state) => {
    state.businesses = [];
    state.accounts = [];
    state.sessions = [];
    state.pendingSignups = [];
    state.otpChallenges = [];
    state.subscriptions = [];
    state.products = [];
    state.orders = [];
  });
  process.env.WHATSAPP_PLATFORM_WABA_ID = "test-waba";
  process.env.WHATSAPP_PLATFORM_TOKEN = "unit-test-token";
});

test.after(() => {
  if (originalWaba === undefined) delete process.env.WHATSAPP_PLATFORM_WABA_ID;
  else process.env.WHATSAPP_PLATFORM_WABA_ID = originalWaba;
  if (originalToken === undefined) delete process.env.WHATSAPP_PLATFORM_TOKEN;
  else process.env.WHATSAPP_PLATFORM_TOKEN = originalToken;
  if (originalEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = originalEncryptionKey;
});

function createPendingSignup(overrides = {}) {
  return db.mutate((state) => db.createPendingSignup(state, {
    businessName: "Test Duka",
    merchantType: "retail",
    personalPhone: "254700111001",
    pesaAiNumber: "254700111002",
    ...overrides,
  }));
}

function mockMetaNumbers(numbers) {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, status: 200, json: async () => ({ data: numbers }) };
  };
  return {
    calls,
    restore: () => { global.fetch = originalFetch; },
  };
}

test("signup needs no SMS provider for the Duka SIM", async () => {
  const originalSend = whatsapp.sendPlatformOtp;
  const smsUrl = process.env.SMS_PROVIDER_URL;
  const smsToken = process.env.SMS_PROVIDER_TOKEN;
  delete process.env.SMS_PROVIDER_URL;
  delete process.env.SMS_PROVIDER_TOKEN;
  const sentTo = [];
  whatsapp.sendPlatformOtp = async (phone) => { sentTo.push(phone); };
  try {
    const response = await authRoutes.signup({
      body: {
        businessName: "No SMS Duka",
        merchantType: "retail",
        personalPhone: "254700111011",
        pesaAiNumber: "254700111012",
      },
    });
    const pending = db.getPendingSignup(response.data.pendingSignupId);
    assert.equal(response.status, 202);
    assert.equal(response.data.next, "personal");
    assert.equal(response.data.smsPending, undefined);
    assert.equal(pending.shopVerified, false);
    assert.equal(pending.metaVerified, false);
    assert.equal(db.load().otpChallenges.some((item) => item.purpose === "signup_shop"), false);
    assert.deepEqual(sentTo, ["254700111011"]);
  } finally {
    whatsapp.sendPlatformOtp = originalSend;
    if (smsUrl === undefined) delete process.env.SMS_PROVIDER_URL;
    else process.env.SMS_PROVIDER_URL = smsUrl;
    if (smsToken === undefined) delete process.env.SMS_PROVIDER_TOKEN;
    else process.env.SMS_PROVIDER_TOKEN = smsToken;
  }
});

test("admin confirms only the exact connected Meta Duka number and does not finalize from the admin request", async () => {
  const pending = createPendingSignup();
  db.markPendingSignupChannelVerified(pending.id, "personal");
  const meta = mockMetaNumbers([
    { id: "meta-phone-1", display_phone_number: "+254 700 111 002", status: "CONNECTED" },
  ]);
  try {
    const result = await adminRoutes.verifyPendingSignupMeta({
      params: { pendingSignupId: pending.id },
      session: { isAdmin: true },
    });
    assert.equal(result.verified, true);
    assert.equal(result.finalized, false);
    assert.equal(db.getPendingSignup(pending.id).metaVerified, true);
    assert.equal(db.load().businesses.length, 0);
    assert.equal(meta.calls.length, 1);
    assert.match(meta.calls[0].url, new RegExp(`${whatsapp.GRAPH_API_VERSION}/test-waba/phone_numbers`));
    assert.equal(meta.calls[0].options.method || "GET", "GET");
    assert.equal(meta.calls[0].options.headers.authorization, "Bearer unit-test-token");
  } finally {
    meta.restore();
  }
});

test("a different or not-yet-connected Meta number does not verify the Duka SIM", async () => {
  const pending = createPendingSignup();
  for (const number of [
    { id: "wrong-number", display_phone_number: "+254 700 111 099", status: "CONNECTED" },
    { id: "pending-number", display_phone_number: "+254 700 111 002", status: "PENDING" },
  ]) {
    const meta = mockMetaNumbers([number]);
    try {
      const result = await adminRoutes.verifyPendingSignupMeta({
        params: { pendingSignupId: pending.id },
        session: { isAdmin: true },
      });
      assert.equal(result.verified, false);
      assert.equal(db.getPendingSignup(pending.id).metaVerified, false);
    } finally {
      meta.restore();
    }
  }
});

test("Meta verification is admin-only and cannot mark a different number in the database", async () => {
  const pending = createPendingSignup();
  assert.throws(
    () => adminRoutes.listPendingSignups({ session: null }),
    /admin/i,
  );
  assert.throws(
    () => db.markPendingSignupMetaVerified(pending.id, {
      phoneNumberId: "meta-phone",
      wabaId: "test-waba",
      phoneNumber: "254700111099",
    }),
    /exact Duka number/,
  );
});

test("personal verification waits for the browser completion route even if Meta confirmed first", async () => {
  const pending = createPendingSignup();
  const challenge = db.createOtpChallenge(pending.personalPhone, "signup_personal", { pendingSignupId: pending.id });
  db.markPendingSignupMetaVerified(pending.id, {
    phoneNumberId: "meta-phone-first",
    wabaId: "test-waba",
    phoneNumber: pending.pesaAiNumber,
  });
  const req = { headers: { cookie: "" } };

  const verified = await authRoutes.verifySignupOtp({
    body: { pendingSignupId: pending.id, code: challenge.code },
    req,
  });
  assert.equal(verified.data.next, "shop");
  assert.equal(db.load().businesses.length, 0);

  const completed = authRoutes.completeSignup({ body: { pendingSignupId: pending.id }, req });
  assert.match(completed.cookie, /^pesaai_session=/);
  assert.equal(completed.data.business.whatsappPhoneNumberId, "meta-phone-first");
});

test("the completion route does not create an account without server-side credential encryption", () => {
  const pending = createPendingSignup();
  db.markPendingSignupChannelVerified(pending.id, "personal");
  db.markPendingSignupMetaVerified(pending.id, {
    phoneNumberId: "meta-phone-no-key",
    wabaId: "test-waba",
    phoneNumber: pending.pesaAiNumber,
  });
  const key = process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY;
  try {
    assert.throws(
      () => authRoutes.completeSignup({
        body: { pendingSignupId: pending.id },
        req: { headers: { cookie: "" } },
      }),
      /credential encryption is not configured/,
    );
    assert.equal(db.load().businesses.length, 0);
    assert.equal(db.load().accounts.length, 0);
  } finally {
    if (key === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = key;
  }
});

test("the live account is created only after both proofs and stores the confirmed Meta routing", () => {
  const pending = createPendingSignup();
  db.markPendingSignupChannelVerified(pending.id, "personal");
  db.markPendingSignupMetaVerified(pending.id, {
    phoneNumberId: "meta-phone-live",
    wabaId: "test-waba",
    phoneNumber: "+254700111002",
  });

  assert.throws(
    () => db.finalizePendingSignup(pending.id),
    /Platform WhatsApp credentials are not configured/,
  );
  assert.equal(db.load().businesses.length, 0);
  const { business } = db.finalizePendingSignup(pending.id, { accessToken: "unit-test-token" });
  assert.equal(business.metaVerified, true);
  assert.equal(business.pesaAiNumberVerified, true);
  assert.equal(business.whatsappPhoneNumberId, "meta-phone-live");
  assert.equal(business.whatsappWabaId, "test-waba");
  assert.equal(business.whatsappNumber, "254700111002");
  assert.equal(db.getWhatsAppStatus(business.id).connected, true);
  assert.equal(db.isPublicShopDiscoverable(business), true);

  assert.equal(db.isPublicShopDiscoverable({
    ...business,
    metaPhoneNumber: "254700111099",
  }), false);
  assert.equal(db.isPublicShopDiscoverable({
    ...business,
    whatsappConnectionStatus: "failed",
  }), false);
});