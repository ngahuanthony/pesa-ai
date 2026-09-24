const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-si-types-"));
const db = require("../db");
const businessRoutes = require("./business");
const authRoutes = require("./auth");
const whatsapp = require("../whatsapp");

test("signup groups legacy hotel and hospitality into one merchant type", () => {
  for (const [value, expected] of [
    ["retail", "retail"],
    ["hotel", "hospitality"],
    ["hospitality", "hospitality"],
    ["service", "service"],
    ["other", "other"],
  ]) {
    const state = { businesses: [], pendingSignups: [] };
    const pending = db.createPendingSignup(state, {
      businessName: "Example", personalPhone: "254700000001",
      pesaAiNumber: "254700000002", merchantType: value,
    });
    assert.equal(pending.merchantType, expected);
  }
});

test("signup reports a saved shop-number conflict without claiming WhatsApp checked it", () => {
  db.mutate((state) => db.createBusiness(state, {
    name: "Existing Shop",
    phone: "254700000021",
    pesaAiNumber: "254700000022",
  }));

  assert.throws(
    () => db.mutate((state) => db.createPendingSignup(state, {
      businessName: "New Shop",
      personalPhone: "254700000023",
      pesaAiNumber: "0700000022",
    })),
    /public shop number is already registered to a Pesa SI shop/
  );
});

test("an expired signup reservation does not permanently block a new line", () => {
  const state = {
    businesses: [],
    pendingSignups: [{
      id: "expired",
      pesaAiNumber: "254700000032",
      expiresAt: "2020-01-01T00:00:00.000Z",
    }],
  };
  const pending = db.createPendingSignup(state, {
    businessName: "Retry Shop",
    personalPhone: "254700000033",
    pesaAiNumber: "0700000032",
  });
  assert.equal(pending.pesaAiNumber, "254700000032");
});

test("same merchant can resume an active signup without discarding verified progress", () => {
  const state = { businesses: [], pendingSignups: [], otpChallenges: [] };
  const details = { businessName: "Retry Shop", merchantType: "retail", personalPhone: "254700000041", pesaAiNumber: "254700000042" };
  const first = db.createPendingSignup(state, details);
  first.personalVerified = true;
  state.otpChallenges.push({ metadata: { pendingSignupId: first.id }, used: false });

  const retried = db.createPendingSignup(state, { ...details, pesaAiNumber: "0700000042" });
  assert.equal(retried.id, first.id);
  assert.equal(state.pendingSignups.length, 1);
  assert.equal(state.otpChallenges[0].used, false);
  assert.equal(retried.personalVerified, true);
  assert.equal(retried.shopVerified, false);
});

test("a different private number cannot restart another pending signup", () => {
  const state = { businesses: [], pendingSignups: [], otpChallenges: [] };
  const details = { businessName: "Reserved Shop", merchantType: "retail", personalPhone: "254700000051", pesaAiNumber: "254700000052" };
  const first = db.createPendingSignup(state, details);
  assert.throws(() => db.createPendingSignup(state, { ...details, personalPhone: "254700000053" }), /different signup details/);
  assert.equal(state.pendingSignups[0].id, first.id);
});

test("retrying signup reuses the reservation and requests a fresh private-number code", async () => {
  const body = { businessName: "Resume Shop", merchantType: "retail", personalPhone: "254700000061", pesaAiNumber: "254700000062" };
  const first = db.mutate((state) => db.createPendingSignup(state, body));
  const sendOriginal = whatsapp.sendPlatformOtp;
  const smsUrlOriginal = process.env.SMS_PROVIDER_URL;
  const delivered = [];
  whatsapp.sendPlatformOtp = async (phone) => { delivered.push(phone); };
  delete process.env.SMS_PROVIDER_URL;
  try {
    const response = await authRoutes.signup({ body });
    assert.equal(response.status, 202);
    assert.equal(response.data.pendingSignupId, first.id);
    assert.equal(db.getPendingSignup(response.data.pendingSignupId).personalVerified, false);
    assert.deepEqual(delivered, [body.personalPhone]);
  } finally {
    whatsapp.sendPlatformOtp = sendOriginal;
    if (smsUrlOriginal === undefined) delete process.env.SMS_PROVIDER_URL;
    else process.env.SMS_PROVIDER_URL = smsUrlOriginal;
  }
});

test("wrong codes consume the attempt limit and another signup's code cannot verify this one", () => {
  const sharedPhone = "254700000081";
  const first = db.mutate((state) => db.createPendingSignup(state, { businessName: "First", personalPhone: sharedPhone, pesaAiNumber: "254700000082" }));
  const second = db.mutate((state) => db.createPendingSignup(state, { businessName: "Second", personalPhone: sharedPhone, pesaAiNumber: "254700000083" }));
  const a = db.createOtpChallenge(sharedPhone, "signup_personal", { pendingSignupId: first.id });
  const b = db.createOtpChallenge(sharedPhone, "signup_personal", { pendingSignupId: second.id });
  assert.throws(() => db.verifyOtpChallenge(sharedPhone, b.code, "signup_personal", first.id), /code is not correct/);
  assert.equal(db.load().otpChallenges.find((item) => item.metadata?.pendingSignupId === first.id).attempts, 1);
  for (let i = 0; i < 3; i++) assert.throws(() => db.verifyOtpChallenge(sharedPhone, "000000", "signup_personal", first.id), /code is not correct/);
  assert.throws(() => db.verifyOtpChallenge(sharedPhone, "000000", "signup_personal", first.id), /Too many attempts/);
  assert.equal(db.load().otpChallenges.find((item) => item.metadata?.pendingSignupId === first.id).attempts, 5);
  assert.throws(() => db.verifyOtpChallenge(sharedPhone, a.code, "signup_personal", first.id), /Too many attempts/);
  assert.equal(db.verifyOtpChallenge(sharedPhone, b.code, "signup_personal", second.id), true);
});

test("overlapping retries share one OTP request and the same pending signup", async () => {
  const body = { businessName: "Concurrent Shop", merchantType: "retail", personalPhone: "254700000091", pesaAiNumber: "254700000092" };
  const sendOriginal = whatsapp.sendPlatformOtp;
  const smsUrlOriginal = process.env.SMS_PROVIDER_URL;
  let finishSend;
  let sendCount = 0;
  whatsapp.sendPlatformOtp = async () => { sendCount++; await new Promise((resolve) => { finishSend = resolve; }); };
  delete process.env.SMS_PROVIDER_URL;
  try {
    const first = authRoutes.signup({ body });
    const second = authRoutes.signup({ body });
    assert.equal(sendCount, 1);
    finishSend();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.data.pendingSignupId, b.data.pendingSignupId);
    assert.equal(db.getPendingSignup(a.data.pendingSignupId).personalVerified, false);
  } finally {
    whatsapp.sendPlatformOtp = sendOriginal;
    if (smsUrlOriginal === undefined) delete process.env.SMS_PROVIDER_URL;
    else process.env.SMS_PROVIDER_URL = smsUrlOriginal;
  }
});

test("resuming after private-number verification does not erase progress or resend WhatsApp", async () => {
  const body = { businessName: "Partially Verified", merchantType: "retail", personalPhone: "254700000101", pesaAiNumber: "254700000102" };
  const pending = db.mutate((state) => db.createPendingSignup(state, body));
  db.markPendingSignupChannelVerified(pending.id, "personal");
  const sendOriginal = whatsapp.sendPlatformOtp;
  const smsUrlOriginal = process.env.SMS_PROVIDER_URL;
  whatsapp.sendPlatformOtp = async () => { throw new Error("WhatsApp must not be resent"); };
  delete process.env.SMS_PROVIDER_URL;
  try {
    const response = await authRoutes.signup({ body });
    assert.equal(response.data.pendingSignupId, pending.id);
    assert.equal(response.data.next, "shop");
    assert.equal(db.getPendingSignup(pending.id).personalVerified, true);
  } finally {
    whatsapp.sendPlatformOtp = sendOriginal;
    if (smsUrlOriginal === undefined) delete process.env.SMS_PROVIDER_URL;
    else process.env.SMS_PROVIDER_URL = smsUrlOriginal;
  }
});

test("failed code delivery releases the reservation without erasing rate limits", async () => {
  const body = { businessName: "Failed Code Shop", merchantType: "retail", personalPhone: "254700000071", pesaAiNumber: "254700000072" };
  const sendOriginal = whatsapp.sendPlatformOtp;
  whatsapp.sendPlatformOtp = async () => { throw new Error("simulated delivery failure"); };
  try {
    await assert.rejects(authRoutes.signup({ body }), /couldn't send the WhatsApp code/);
    assert.equal(db.load().pendingSignups.some((item) => item.pesaAiNumber === body.pesaAiNumber), false);
    const challenges = db.load().otpChallenges.filter((item) => item.phone === body.personalPhone && item.purpose === "signup_personal");
    assert.equal(challenges.length, 1);
    assert.equal(challenges[0].used, true);
  } finally {
    whatsapp.sendPlatformOtp = sendOriginal;
  }
});

test("existing hotel accounts display as hospitality and save the unified type", () => {
  const business = db.mutate((state) => db.createBusiness(state, {
    name: "Existing Hotel", phone: "254700000011", merchantType: "hospitality",
  }));
  db.updateBusiness(business.id, { merchantType: "hotel" }, "test");
  assert.equal(db.sanitizeBusiness(db.getBusiness(business.id)).merchantType, "hospitality");
  const updated = businessRoutes.update({
    params: { id: business.id }, session: { businessId: business.id },
    body: { merchantType: "hotel" },
  });
  assert.equal(updated.merchantType, "hospitality");
  assert.equal(db.getBusiness(business.id).merchantType, "hospitality");
  assert.throws(() => businessRoutes.update({
    params: { id: business.id }, session: { businessId: business.id },
    body: { merchantType: "unknown" },
  }), /merchantType must be/);
});