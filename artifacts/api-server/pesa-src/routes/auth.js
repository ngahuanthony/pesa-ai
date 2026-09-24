const db = require("../db");
const auth = require("../auth");
const whatsapp = require("../whatsapp");

function accountView(account) {
  const business = db.getBusiness(account.businessId);
  const rawPersonalPhone = account.personalPhone || business.personalPhone;
  return { id: account.id, email: account.email || null, recoveryEmail: db.maskEmail(account.recoveryEmail), personalPhone: db.maskPhone(rawPersonalPhone), personalPhoneVerified: Boolean(account.personalPhoneVerified), authMethod: account.authMethod || (account.passwordHash ? "legacy_email_password" : "phone_otp") };
}

function requireShopFields(body) {
  if (!body?.businessName || !body?.personalPhone || !body?.pesaAiNumber) throw db.httpError(400, "Shop name, new shop number, and personal WhatsApp are required");
}

async function sendPersonalOtp(phone, purpose, shopName) {
  const challenge = db.createOtpChallenge(phone, purpose, shopName ? { shopName } : {});
  await whatsapp.sendPlatformOtp(challenge.phone, challenge.code, { shopName });
  return challenge;
}

const signupRequests = new Map();

async function signup({ body }) {
  requireShopFields(body);
  const key = [db.normalizePhone(body.pesaAiNumber), db.normalizePhone(body.personalPhone), String(body.businessName).trim().toLowerCase(), db.normalizeMerchantType(body.merchantType)].join(":");
  if (signupRequests.has(key)) return signupRequests.get(key);
  const request = startSignup(body);
  signupRequests.set(key, request);
  try { return await request; } finally { signupRequests.delete(key); }
}

async function startSignup(body) {
  const pending = db.mutate((state) => db.createPendingSignup(state, body));
  if (!pending.personalVerified) {
    let personalChallenge;
    try {
      personalChallenge = db.createOtpChallenge(pending.personalPhone, "signup_personal", { pendingSignupId: pending.id, shopName: pending.businessName });
    } catch (error) {
      if (!pending.shopVerified) db.cancelPendingSignup(pending.id);
      throw error;
    }
    try {
      await whatsapp.sendPlatformOtp(personalChallenge.phone, personalChallenge.code, { shopName: pending.businessName });
    } catch (error) {
      console.error("[auth] WhatsApp OTP failed:", error.message);
      if (!pending.shopVerified) db.cancelPendingSignup(pending.id);
      throw db.httpError(503, "We couldn't send the WhatsApp code. Please try again shortly.");
    }
  }
  return { status: 202, data: { verificationRequired: true, pendingSignupId: pending.id, personalPhone: db.maskPhone(pending.personalPhone), shopPhone: db.maskPhone(pending.pesaAiNumber), next: pending.personalVerified ? "shop" : "personal", message: "Confirm your personal WhatsApp. An admin will confirm your Duka SIM through Meta." } };
}

async function verifySignupOtp({ body, req }) {
  const channel = "personal";
  const purpose = "signup_personal";
  const pending = db.getPendingSignup(body?.pendingSignupId);
  if (!pending || new Date(pending.expiresAt).getTime() < Date.now()) throw db.httpError(404, "Signup not found or expired");
  db.verifyOtpChallenge(pending.personalPhone, body.code, purpose, pending.id);
  const updated = db.markPendingSignupChannelVerified(pending.id, channel);
  return {
    data: {
      verificationRequired: true,
      next: "shop",
      pendingSignupId: updated.id,
      message: updated.metaVerified
        ? "Both phone checks are complete. Your shop is opening."
        : "Your personal WhatsApp is verified. We are waiting for admin Meta confirmation of the Duka SIM.",
    },
  };
}

async function resendSignupOtp({ body }) {
  const channel = "personal";
  const pending = db.getPendingSignup(body?.pendingSignupId);
  if (!pending || new Date(pending.expiresAt).getTime() < Date.now()) throw db.httpError(400, "This signup has expired. Please start again.");
  if ((channel === "personal" && pending.personalVerified) || (channel === "shop" && pending.shopVerified)) return { data: { alreadyVerified: true, channel } };
  const purpose = "signup_personal";
  const phone = pending.personalPhone;
  const challenge = db.createOtpChallenge(phone, purpose, { pendingSignupId: pending.id, shopName: pending.businessName });
  try { await whatsapp.sendPlatformOtp(challenge.phone, challenge.code, { shopName: pending.businessName }); } catch (error) { console.error("[auth] WhatsApp OTP resend failed:", error.message); throw db.httpError(503, "We could not send a new WhatsApp code yet. Please try again shortly."); }
  return { data: { sent: true, channel, expiresAt: challenge.expiresAt, message: "A new WhatsApp code has been sent." } };
}

function pendingSignupStatus({ params }) { return db.getPendingSignupStatus(params.pendingSignupId); }

function openVerifiedSignup(pendingId, req) {
  const pending = db.getPendingSignup(pendingId);
  if (!pending || !pending.personalVerified || !pending.metaVerified) {
    throw db.httpError(409, "Personal WhatsApp and Meta Duka verification are both required");
  }
  const accessToken = process.env.WHATSAPP_PLATFORM_TOKEN || process.env.WHATSAPP_TOKEN;
  if (!accessToken) throw db.httpError(503, "Platform WhatsApp credentials are not configured");
  if (!process.env.ENCRYPTION_KEY) throw db.httpError(503, "Server credential encryption is not configured");
  const draftToken = require("../setup-drafts").tokenFromRequest(req);
  const { business, account } = db.finalizePendingSignup(pendingId, { draftToken, accessToken });
  const session = db.createSession({ accountId: account.id, businessId: business.id });
  return { cookie: auth.sessionCookieHeader(session.token), data: { business: db.sanitizeBusiness(business), account: accountView(account), subscription: db.getSubscription(business.id) } };
}

function completeSignup({ body, req }) {
  if (!body?.pendingSignupId) throw db.httpError(400, "Pending signup ID is required");
  return openVerifiedSignup(body.pendingSignupId, req);
}

async function requestLoginOtp({ body }) {
  const phone = db.normalizePhone(body?.personalPhone || body?.phone);
  if (!phone) throw db.httpError(400, "Personal WhatsApp number is required");
  const account = db.getAccountByPersonalPhone(phone);
  if (!account) throw db.httpError(404, "No shop was found for that WhatsApp number");
  try {
    const challenge = await sendPersonalOtp(phone, "login");
    return { data: { verificationRequired: true, phone: db.maskPhone(challenge.phone), expiresAt: challenge.expiresAt, serviceWindowRequired: false } };
  } catch (error) {
    const message = String(error?.message || "");
    if (!message.includes("132001") && !message.toLowerCase().includes("template name does not exist")) throw error;
    const displayNumber = String(process.env.WHATSAPP_DISPLAY_NUMBER || "254792717918").replace(/\D/g, "");
    return {
      status: 202,
      data: {
        verificationRequired: true,
        serviceWindowRequired: true,
        phone: db.maskPhone(phone),
        whatsappNumber: displayNumber,
        whatsappLink: "https://wa.me/" + displayNumber + "?text=LOGIN",
        message: "Send LOGIN from your registered WhatsApp number. Pesa SI will reply with a five-minute login code.",
      },
    };
  }
}

async function verifyOtp({ body }) {
  const phone = db.normalizePhone(body?.personalPhone || body?.phone);
  if (!phone || !body?.code) throw db.httpError(400, "Phone number and OTP code are required");
  db.verifyOtpChallenge(phone, body.code, "login");
  const account = db.getAccountByPersonalPhone(phone);
  if (!account) throw db.httpError(404, "No shop was found for that WhatsApp number");
  db.markPersonalPhoneVerified(account.businessId);
  const verifiedAccount = db.getAccountByPersonalPhone(phone);
  const session = db.createSession({ accountId: verifiedAccount.id, businessId: verifiedAccount.businessId });
  const business = db.getBusiness(verifiedAccount.businessId);
  return { cookie: auth.sessionCookieHeader(session.token), data: { business: db.sanitizeBusiness(business), account: accountView(verifiedAccount), subscription: db.getSubscription(business.id) } };
}

function login({ body }) {
  const { email, password } = body || {};
  if (!email || !password) throw db.httpError(400, "email and password are required");
  const account = db.getAccountByEmail(email);
  if (!account || !auth.verifyPassword(password, account.passwordHash, account.passwordSalt)) throw db.httpError(401, "Invalid credentials");
  const session = db.createSession({ accountId: account.id, businessId: account.businessId });
  const business = db.getBusiness(account.businessId);
  return { cookie: auth.sessionCookieHeader(session.token), data: { business: db.sanitizeBusiness(business), account: accountView(account), subscription: db.getSubscription(business.id) } };
}

async function updateRecoveryEmail({ body, session }) {
  if (!session || session.isAdmin) throw db.httpError(401, "Authentication required");
  const recoveryEmail = String(body?.recoveryEmail || "").trim().toLowerCase();
  if (recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) {
    throw db.httpError(400, "Enter a valid recovery email or leave it blank");
  }
  const account = db.updateAccountRecoveryEmail(session.accountId, recoveryEmail || null);
  return { data: { recoveryEmail: db.maskEmail(account.recoveryEmail) } };
}

function logout({ session }) { if (session) db.deleteSession(session.token); return { cookie: auth.sessionCookieHeader(null, { clear: true }), data: { ok: true } }; }
function me({ session }) {
  if (!session) return { authenticated: false };
  if (session.isAdmin) return { authenticated: true, isAdmin: true };
  const account = db.getAccountById(session.accountId);
  const business = db.getBusiness(session.businessId);
  return { authenticated: true, isAdmin: false, account: accountView(account), business: db.sanitizeBusiness(business), subscription: db.getSubscription(business.id) };
}
module.exports = { signup, verifySignupOtp, resendSignupOtp, pendingSignupStatus, completeSignup, requestLoginOtp, verifyOtp, login, updateRecoveryEmail, logout, me };
