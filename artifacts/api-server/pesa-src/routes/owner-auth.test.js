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
const ownerSessionAuth = require("../auth");
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
  const pending = db.load().pendingSignups.find((item) =>
    item.ownerClerkUserId === currentIdentity.clerkUserId
  );
  return { response, pending };
}

test("verified Clerk email creates a dashboard session without an authenticator", async () => {
  const { response, pending } = await startSignup();
  assert.equal(response.status, 200);
  assert.match(response.cookie, /^pesaai_session=/);
  assert.equal(response.data.account.authMethod, "clerk_email");
  assert.equal(response.data.account.email, currentIdentity.email);
  assert.equal(response.data.activation, "waiting_for_meta");
  assert.equal("recoveryCodes" in response.data, false);
  assert.equal(pending.personalPhone, null);
  assert.equal(pending.ownerSecurityVerified, true);
  assert.equal(pending.finalizedAt != null, true);
  assert.equal("totpSecretEnc" in pending, false);

  const business = db.getBusiness(response.data.business.id);
  const account = db.getAccountByClerkUserId(currentIdentity.clerkUserId);
  const session = ownerSessionAuth.resolveSession({ headers: { cookie: response.cookie } });
  assert.ok(session);
  const dashboard = authRoutes.me({ session });

  assert.equal(account.authMethod, "clerk_email");
  assert.equal(dashboard.authenticated, true);
  assert.equal(dashboard.account.id, account.id);
  assert.equal(dashboard.business.id, business.id);
  assert.equal(account.ownerSecurityVerified, true);
  assert.equal(business.ownerSecurityVerified, true);
  assert.equal(business.personalPhone, null);
  assert.equal(db.isCustomerMessagingActive(business), false);
  assert.equal(db.isPublicShopDiscoverable(business), false);
  const whatsappStatus = db.getVendorWhatsAppStatus(business.id);
  assert.equal(whatsappStatus.connected, false);
  assert.equal(whatsappStatus.canReceiveCustomerMessages, false);
  assert.equal(whatsappStatus.messagingBlockReason, "business_activation_incomplete");

  await assert.rejects(
    chatRoutes.send({
      params: { businessId: business.id },
      body: { customerPhone: "254700111099", message: "Hello" },
      session: { businessId: business.id, accountId: account.id },
    }),
    (error) => error.statusCode === 409 && /owner security and Meta/.test(error.message),
  );
});

test("exact Meta confirmation activates the shop and existing Clerk owners sign in without TOTP", async () => {
  const { pending } = await startSignup();
  process.env.WHATSAPP_PLATFORM_TOKEN = "unit-test-platform-token";
  db.markPendingSignupMetaVerified(pending.id, {
    phoneNumberId: "meta-phone-owner-1",
    wabaId: "test-waba",
    phoneNumber: pending.pesaAiNumber,
    accessToken: process.env.WHATSAPP_PLATFORM_TOKEN,
  });

  const business = db.getBusiness(pending.businessId);
  const account = db.getAccountByClerkUserId(currentIdentity.clerkUserId);
  assert.equal(db.isCustomerMessagingActive(business), true, JSON.stringify({
    requiresVerifiedOwnerAuth: business.requiresVerifiedOwnerAuth,
    ownerSecurityVerified: business.ownerSecurityVerified,
    metaVerified: business.metaVerified,
    metaPhoneNumber: business.metaPhoneNumber,
    metaPhoneNumberId: business.metaPhoneNumberId,
    metaWabaId: business.metaWabaId,
    pesaAiNumber: business.pesaAiNumber,
    whatsappNumber: business.whatsappNumber,
    whatsappPhoneNumberId: business.whatsappPhoneNumberId,
    whatsappWabaId: business.whatsappWabaId,
    whatsappConnectionStatus: business.whatsappConnectionStatus,
    accessTokenSet: Boolean(business.whatsappAccessTokenEnc),
  }));
  assert.equal(db.isPublicShopDiscoverable(business), true);
  assert.equal(business.whatsappPhoneNumberId, "meta-phone-owner-1");
  const whatsappStatus = db.getVendorWhatsAppStatus(business.id);
  assert.equal(whatsappStatus.connected, true);
  assert.equal(whatsappStatus.canReceiveCustomerMessages, true);
  assert.equal(whatsappStatus.messagingBlockReason, null);

  const login = await authRoutes.ownerLoginStart({ req: request });
  assert.equal(login.status, 200);
  assert.match(login.cookie, /^pesaai_session=/);
  assert.equal(login.data.account.id, account.id);
  assert.equal(login.data.account.authMethod, "clerk_email");
  assert.equal("challengeId" in login.data, false);
});

test("existing Clerk authenticator data is cleared while legacy login methods remain unchanged", async () => {
  db.mutate((state) => {
    state.businesses.push({
      id: "business-existing-clerk",
      ownerSecurityVerified: false,
      requiresVerifiedOwnerAuth: true,
    });
    state.accounts.push({
      id: "account-existing-clerk",
      businessId: "business-existing-clerk",
      email: "existing@example.com",
      clerkUserId: "clerk-existing-owner",
      authMethod: "clerk_totp",
      ownerSecurityVerified: true,
      totpSecretEnc: "encrypted-old-secret",
      totpEnrolledAt: "2026-01-01T00:00:00.000Z",
      totpRecoveryCodeHashes: ["old-recovery-hash"],
      totpLastCounter: 100,
    });
    state.accounts.push({
      id: "account-legacy",
      businessId: "business-legacy",
      email: "legacy@example.com",
      authMethod: "legacy_email_password",
      passwordHash: "unchanged",
    });
    state.pendingSignups.push({
      id: "pending-old-clerk",
      ownerAuthProvider: "clerk",
      totpSecretEnc: "encrypted-exposed-pending-secret",
      totpEnrollmentAttempts: 1,
    });
    state.ownerAuthChallenges.push({ id: "old-challenge", clerkUserId: "clerk-existing-owner" });
  });

  assert.deepEqual(db.migrateClerkAuthenticatorRemoval(), {
    accountsConverted: 1,
    pendingSecretsCleared: 1,
  });
  const migrated = db.getAccountByClerkUserId("clerk-existing-owner");
  assert.equal(migrated.authMethod, "clerk_email");
  assert.equal(migrated.ownerSecurityVerified, true);
  assert.equal("totpSecretEnc" in migrated, false);
  assert.equal("totpRecoveryCodeHashes" in migrated, false);
  assert.equal(db.getBusiness("business-existing-clerk").ownerSecurityVerified, true);
  assert.equal(db.getAccountById("account-legacy").authMethod, "legacy_email_password");
  assert.equal("totpSecretEnc" in db.getPendingSignup("pending-old-clerk"), false);
  assert.equal(db.load().ownerAuthChallenges.length, 0);

  currentIdentity = { clerkUserId: "clerk-existing-owner", email: "existing@example.com" };
  const login = await authRoutes.ownerLoginStart({ req: request });
  assert.match(login.cookie, /^pesaai_session=/);
  assert.equal(login.data.account.authMethod, "clerk_email");
});

test("legacy email-password owners must prove the current password before changing it", () => {
  const businessId = "business-legacy-password";
  const accountId = "account-legacy-password";
  const originalCredentials = ownerSessionAuth.hashPassword("old-password-123");
  db.mutate((state) => {
    state.accounts.push({
      id: accountId,
      businessId,
      email: "legacy-password@example.com",
      authMethod: "legacy_email_password",
      ...originalCredentials,
    });
  });
  const session = { accountId, businessId, isAdmin: false, token: "legacy-session" };

  assert.throws(
    () => authRoutes.changePassword({
      session,
      body: { currentPassword: "incorrect-password", newPassword: "new-password-456" },
    }),
    (error) => error.statusCode === 401 && /current password is incorrect/i.test(error.message),
  );
  assert.equal(db.getAccountById(accountId).passwordHash, originalCredentials.passwordHash);

  const response = authRoutes.changePassword({
    session,
    body: { currentPassword: "old-password-123", newPassword: "new-password-456" },
  });
  const updatedAccount = db.getAccountById(accountId);
  assert.deepEqual(response, { data: { ok: true } });
  assert.equal(ownerSessionAuth.verifyPassword("old-password-123", updatedAccount.passwordHash, updatedAccount.passwordSalt), false);
  assert.equal(ownerSessionAuth.verifyPassword("new-password-456", updatedAccount.passwordHash, updatedAccount.passwordSalt), true);
  assert.notEqual(updatedAccount.passwordSalt, originalCredentials.passwordSalt);
});

test("password change rejects unsupported sign-in methods and invalid sessions", () => {
  db.mutate((state) => {
    state.accounts.push({
      id: "account-clerk-password",
      businessId: "business-clerk-password",
      email: "clerk-password@example.com",
      authMethod: "clerk_email",
    });
  });

  assert.throws(
    () => authRoutes.changePassword({
      session: { accountId: "account-clerk-password", businessId: "business-clerk-password", isAdmin: false },
      body: { currentPassword: "old-password-123", newPassword: "new-password-456" },
    }),
    (error) => error.statusCode === 409,
  );
  assert.throws(
    () => authRoutes.changePassword({
      session: { accountId: "account-clerk-password", businessId: "another-business", isAdmin: false },
      body: { currentPassword: "old-password-123", newPassword: "new-password-456" },
    }),
    (error) => error.statusCode === 401,
  );
});

test("password change updates only the authenticated account for a business", () => {
  const businessId = "business-multiple-owners";
  const firstAccountCredentials = ownerSessionAuth.hashPassword("first-current-password");
  const targetAccountCredentials = ownerSessionAuth.hashPassword("target-current-password");
  db.mutate((state) => {
    state.accounts.push(
      {
        id: "account-first-owner",
        businessId,
        email: "first-owner@example.com",
        authMethod: "legacy_email_password",
        ...firstAccountCredentials,
      },
      {
        id: "account-target-owner",
        businessId,
        email: "target-owner@example.com",
        authMethod: "legacy_email_password",
        ...targetAccountCredentials,
      },
    );
  });

  const response = authRoutes.changePassword({
    session: { accountId: "account-target-owner", businessId, isAdmin: false },
    body: { currentPassword: "target-current-password", newPassword: "target-new-password" },
  });

  const firstAccount = db.getAccountById("account-first-owner");
  const targetAccount = db.getAccountById("account-target-owner");
  assert.deepEqual(response, { data: { ok: true } });
  assert.equal(firstAccount.passwordHash, firstAccountCredentials.passwordHash);
  assert.equal(
    ownerSessionAuth.verifyPassword("target-current-password", targetAccount.passwordHash, targetAccount.passwordSalt),
    false,
  );
  assert.equal(
    ownerSessionAuth.verifyPassword("target-new-password", targetAccount.passwordHash, targetAccount.passwordSalt),
    true,
  );
});