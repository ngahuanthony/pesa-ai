const db = require("../db");
const auth = require("../auth");
const whatsapp = require("../whatsapp");

function accountView(account) {
  const business = db.getBusiness(account.businessId);
  const rawPersonalPhone = account.personalPhone || business.personalPhone;
  return { id: account.id, email: account.email || null, recoveryEmail: account.recoveryEmail || account.email || null, personalPhone: db.maskPhone(rawPersonalPhone), personalPhoneVerified: Boolean(account.personalPhoneVerified), authMethod: account.authMethod || (account.passwordHash ? "legacy_email_password" : "phone_otp") };
}

function requireShopFields(body) {
  if (!body?.businessName || !body?.personalPhone || !body?.pesaAiNumber) throw db.httpError(400, "Shop name, new shop number, and personal WhatsApp are required");
}

async function sendPersonalOtp(phone, purpose, shopName) {
  const challenge = db.createOtpChallenge(phone, purpose, shopName ? { shopName } : {});
  await whatsapp.sendPlatformOtp(challenge.phone, challenge.code, { shopName });
  return challenge;
}

async function sendShopSmsOtp(phone, challenge) {
  const url = process.env.SMS_PROVIDER_URL;
  if (!url) throw new Error("SMS provider is not configured");
  const headers = { "content-type": "application/json" };
  if (process.env.SMS_PROVIDER_TOKEN) headers.authorization = "Bearer " + process.env.SMS_PROVIDER_TOKEN;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ to: phone, message: "Pesa AI: " + challenge.code + " is your verification code to reserve " + phone + " as your shop number." }) });
  if (!response.ok) throw new Error("SMS provider returned " + response.status);
  return true;
}

async function signup({ body }) {
  requireShopFields(body);
  const pending = db.mutate((state) => db.createPendingSignup(state, body));
  const personalChallenge = db.createOtpChallenge(pending.personalPhone, "signup_personal", { pendingSignupId: pending.id, shopName: pending.businessName });
  try {
    await whatsapp.sendPlatformOtp(personalChallenge.phone, personalChallenge.code, { shopName: pending.businessName });
  } catch (error) {
    console.error("[auth] WhatsApp OTP failed:", error.message);
    throw db.httpError(503, "WhatsApp OTP delivery is not configured yet. Please try again shortly.");
  }
  let smsPending = false;
  const shopChallenge = db.createOtpChallenge(pending.pesaAiNumber, "signup_shop", { pendingSignupId: pending.id });
  try { await sendShopSmsOtp(pending.pesaAiNumber, shopChallenge); } catch (error) { smsPending = true; console.warn("[auth] Shop SMS OTP pending:", error.message); }
  return { status: 202, data: { verificationRequired: true, pendingSignupId: pending.id, personalPhone: db.maskPhone(pending.personalPhone), shopPhone: db.maskPhone(pending.pesaAiNumber), smsPending, message: smsPending ? "Personal WhatsApp verified request sent. Shop-number SMS verification is pending." : "Enter both verification codes to create your shop." } };
}

async function verifySignupOtp({ body }) {
  const channel = body?.channel === "shop" ? "shop" : "personal";
  const purpose = channel === "shop" ? "signup_shop" : "signup_personal";
  const pending = db.getPendingSignup(body?.pendingSignupId);
  if (!pending) throw db.httpError(404, "Signup not found or expired");
  db.verifyOtpChallenge(channel === "shop" ? pending.pesaAiNumber : pending.personalPhone, body.code, purpose);
  const updated = db.markPendingSignupChannelVerified(pending.id, channel);
  if (!updated.personalVerified || !updated.shopVerified) return { data: { verificationRequired: true, next: updated.personalVerified ? "shop" : "personal", pendingSignupId: updated.id } };
  const { business, account } = db.finalizePendingSignup(updated.id);
  const session = db.createSession({ accountId: account.id, businessId: business.id });
  return { cookie: auth.sessionCookieHeader(session.token), data: { business: db.sanitizeBusiness(business), account: accountView(account), subscription: db.getSubscription(business.id) } };
}

async function requestLoginOtp({ body }) {
  const phone = db.normalizePhone(body?.personalPhone || body?.phone);
  if (!phone) throw db.httpError(400, "Personal WhatsApp number is required");
  const account = db.getAccountByPersonalPhone(phone);
  if (!account) throw db.httpError(404, "No shop was found for that WhatsApp number");
  const challenge = await sendPersonalOtp(phone, "login");
  return { data: { verificationRequired: true, phone: db.maskPhone(challenge.phone), expiresAt: challenge.expiresAt } };
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
function logout({ session }) { if (session) db.deleteSession(session.token); return { cookie: auth.sessionCookieHeader(null, { clear: true }), data: { ok: true } }; }
function me({ session }) {
  if (!session) return { authenticated: false };
  if (session.isAdmin) return { authenticated: true, isAdmin: true };
  const account = db.getAccountById(session.accountId);
  const business = db.getBusiness(session.businessId);
  return { authenticated: true, isAdmin: false, account: accountView(account), business: db.sanitizeBusiness(business), subscription: db.getSubscription(business.id) };
}
module.exports = { signup, verifySignupOtp, requestLoginOtp, verifyOtp, login, logout, me };
