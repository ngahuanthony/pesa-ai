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

async function sendShopSmsOtp(phone, challenge) {
  const url = process.env.SMS_PROVIDER_URL;
  if (!url) throw new Error("SMS provider is not configured");
  const headers = { "content-type": "application/json" };
  const smsToken = process.env.SMS_PROVIDER_TOKEN || process.env.SMS_API_KEY;
  if (smsToken) headers.authorization = "Bearer " + smsToken;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ to: phone, message: "Pesa SI: " + challenge.code + " is your verification code to reserve " + phone + " as your shop number." }) });
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

async function resendSignupOtp({ body }) {
  const channel = body?.channel === "shop" ? "shop" : "personal";
  const pending = db.getPendingSignup(body?.pendingSignupId);
  if (!pending || new Date(pending.expiresAt).getTime() < Date.now()) throw db.httpError(400, "This signup has expired. Please start again.");
  if ((channel === "personal" && pending.personalVerified) || (channel === "shop" && pending.shopVerified)) return { data: { alreadyVerified: true, channel } };
  const purpose = channel === "shop" ? "signup_shop" : "signup_personal";
  const phone = channel === "shop" ? pending.pesaAiNumber : pending.personalPhone;
  const challenge = db.createOtpChallenge(phone, purpose, { pendingSignupId: pending.id, shopName: pending.businessName });
  if (channel === "shop") {
    try { await sendShopSmsOtp(phone, challenge); } catch (error) { console.warn("[auth] Shop SMS resend pending:", error.message); return { status: 202, data: { sent: false, smsPending: true, channel, expiresAt: challenge.expiresAt, message: "The SMS is still pending. Please try again shortly." } }; }
  } else {
    try { await whatsapp.sendPlatformOtp(challenge.phone, challenge.code, { shopName: pending.businessName }); } catch (error) { console.error("[auth] WhatsApp OTP resend failed:", error.message); throw db.httpError(503, "We could not send a new WhatsApp code yet. Please try again shortly."); }
  }
  return { data: { sent: true, channel, expiresAt: challenge.expiresAt, message: channel === "shop" ? "A new SMS code has been sent." : "A new WhatsApp code has been sent." } };
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
module.exports = { signup, verifySignupOtp, resendSignupOtp, requestLoginOtp, verifyOtp, login, updateRecoveryEmail, logout, me };
