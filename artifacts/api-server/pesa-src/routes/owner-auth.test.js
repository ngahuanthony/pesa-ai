const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-owner-auth-"));
const originalEncryptionKey = process.env.ENCRYPTION_KEY;
const originalPlatformToken = process.env.WHATSAPP_PLATFORM_TOKEN;
process.env.ENCRYPTION_KEY = "b".repeat(64);

const db = require("../db");
const fieldCrypto = require("../crypto");
const ownerSecurity = require("../owner-security");
const clerkIdentity = require("../clerk-identity");
const authRoutes = require("./auth");
const chatRoutes = require("./chat");

let currentIdentity = { clerkUserId: "clerk-owner-1", email: "owner@example.com" };
const originalRequireVerifiedOwner = clerkIdentity.requireVerifiedOwner;
clerkIdentity.requireVerifiedOwner = async () => currentIdentity;

const request = { headers: { host: "pesa.test", origin: "http://pesa.test" } };
const shopDetails = {
  businessName: "Owner Security Test Shop",
  merchantType: "retail",
  pesaAiNumber: "0700111002",
};

test.beforeEach(() => {
  currentIdentity = { clerkUserId: "clerk-owner-1", email: "owner@example.com" };
  db.mutate((state) => {
    state.accounts = [];
    state.businesses = [];
    state.sessions = [];
    state.ownerAuthChallenges = [];
    state.pendingSignups = [];
    state.subscriptions = [];
    state.otpChallenges = [];
    state.products = [];
    state.conversations = [];
    state.messages = [];
  });
  delete process.env.WHATSAPP_PLATFORM_TOKEN;
});

test.after(() => {
  clerkIdentity.requireVerifiedOwner = originalRequireVerifiedOwner;
  if (originalEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = originalEncryptionKey;
  if (originalPlatformToken === undefined) delete process.env.WHATSAPP_PLATFORM_TOKEN;
  else process.env.WHATSAPP_PLATFORM_TOKEN = originalPlatformToken;
});

async function startSignup() {
  const response = await authRoutes.ownerSignupStart({ body: shopDetails, req: request });
  const pending = db.getPendingSignup(response.data.pendingSignupId);
  return { response, pending };
}

function currentCode(pending) {
  const secret = fieldCrypto.decrypt(pending.totpSecretEnc);
  const counter = Math.floor(Date.now() / 1000 / 30);
  return ownerSecurity.codeAtCounter(secret, counter);
}

async function verifySignup(pending) {
  return authRoutes.ownerSignupVerify({
    body: { pendingSignupId: pending.id, code: currentCode(pending) },
    req: request,
  });
}

test("owner signup requires authenticator enrollment before creating a gated shop", async () => {
  const { response, pending } = await startSignup();
  assert.equal(response.status, 200);
  assert.equal(response.data.email, currentIdentity.email);
  assert.match(response.data.provisioningUri, /^otpauth:\/\/totp\//);
  assert.equal(pending.personalPhone, null);
  assert.equal(pending.ownerSecurityVerified, false);

  const completed = await verifySignup(pending);
  const business = db.getBusiness(completed.data.business.id);
  const account = db.getAccountByClerkUserId(currentIdentity.clerkUserId);

  assert.equal(completed.data.recoveryCodes.length, 10);
  assert.equal(completed.data.activation, "waiting_for_meta");
  assert.equal(account.authMethod, "clerk_totp");
  assert.equal(account.ownerSecurityVerified, true);
  assert.equal(business.ownerSecurityVerified, true);
  assert.equal(business.personalPhone, null);
  assert.equal(db.isCustomerMessagingActive(business), false);
  assert.equal(db.isPublicShopDiscoverable(business), false);

  await assert.rejects(
    chatRoutes.send({
      params: { businessId: business.id },
      body: { customerPhone: "254700111099", message: "Hello" },
      session: { businessId: business.id, accountId: account.id },
    }),
    (error) => error.statusCode === 409 && /owner security and Meta/.test(error.message),
  );
});

test("exact Meta confirmation plus owner security activates the shop and recovery codes sign in once", async () => {
  const { pending } = await startSignup();
  db.markPendingSignupMetaVerified(pending.id, {
    phoneNumberId: "meta-phone-owner-1",
    wabaId: "test-waba",
    phoneNumber: pending.pesaAiNumber,
  });
  process.env.WHATSAPP_PLATFORM_TOKEN = "unit-test-platform-token";

  const completed = await verifySignup(pending);
  const business = db.getBusiness(completed.data.business.id);
  const account = db.getAccountByClerkUserId(currentIdentity.clerkUserId);
  assert.equal(completed.data.activation, "active");
  assert.equal(db.isCustomerMessagingActive(business), true);
  assert.equal(db.isPublicShopDiscoverable(business), true);
  assert.equal(business.whatsappPhoneNumberId, "meta-phone-owner-1");

  const login = await authRoutes.ownerLoginStart({ req: request });
  const recoveryCode = completed.data.recoveryCodes[0];
  const verified = await authRoutes.ownerLoginVerify({
    body: { challengeId: login.data.challengeId, code: recoveryCode },
    req: request,
  });
  assert.match(verified.cookie, /^pesaai_session=/);
  assert.equal(db.getAccountById(account.id).totpRecoveryCodeHashes.length, 9);
  await assert.rejects(
    authRoutes.ownerLoginVerify({
      body: { challengeId: login.data.challengeId, code: recoveryCode },
      req: request,
    }),
    /expired/,
  );
});

test("a locked authenticator enrollment can be restarted with a fresh secret", async () => {
  const { pending } = await startSignup();
  db.mutate((state) => {
    state.pendingSignups.find((item) => item.id === pending.id).totpEnrollmentAttempts = 5;
  });
  const oldSecret = pending.totpSecretEnc;
  const restarted = await authRoutes.ownerSignupStart({ body: shopDetails, req: request });
  const updated = db.getPendingSignup(pending.id);

  assert.equal(restarted.data.pendingSignupId, pending.id);
  assert.equal(updated.totpEnrollmentAttempts, 0);
  assert.notEqual(updated.totpSecretEnc, oldSecret);
});