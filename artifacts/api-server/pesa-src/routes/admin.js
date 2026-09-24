// Internal oversight for Adplay Media Ltd staff — not something client
// businesses see. Protected by a single shared password (ADMIN_PASSWORD in
// .env), not a per-person account system — fine for a small internal team,
// revisit if that team grows or needs individual audit trails.

const db = require("../db");
const auth = require("../auth");
const mpesa = require("../mpesa");
const fieldCrypto = require("../crypto");
const whatsapp = require("../whatsapp");
const fs = require("fs");
const path = require("path");

// One-shot data import endpoint — lets you restore db.json from another
// environment (e.g. Replit → Railway). Admin-only. Overwrites the live db.json
// in place so the running process picks up the data immediately.
function importDb({ body, session }) {
  auth.requireAdmin(session);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw db.httpError(400, "Body must be the full db JSON object");
  }
  const dataFile = db.DATA_FILE;
  // Ensure data directory exists (important on fresh Railway volume)
  const dataDir = path.dirname(dataFile);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  // Write atomically via a temp file then rename
  const tmpFile = dataFile + ".import.tmp";
  fs.writeFileSync(tmpFile, JSON.stringify(body, null, 2), "utf8");
  fs.renameSync(tmpFile, dataFile);
  // db.js calls load() fresh on every request — no in-memory reload needed.
  // Count businesses directly from the written file to confirm.
  const written = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  return { ok: true, imported: true, businesses: Object.keys(written.businesses || {}).length };
}

function login({ body }) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw db.httpError(500, "ADMIN_PASSWORD is not set on the server — see .env.example");
  }
  if (!body || body.password !== password) {
    throw db.httpError(401, "Incorrect admin password");
  }
  const session = db.createSession({ isAdmin: true });
  return { cookie: auth.sessionCookieHeader(session.token), data: { ok: true } };
}

function listBusinesses({ session }) {
  auth.requireAdmin(session);
  return db.listBusinessesWithSubscriptions();
}

async function chargeSubscription({ params, body, session }) {
  auth.requireAdmin(session);
  const business = db.getBusiness(params.businessId);
  const phone = (body && body.phone) || business.phone;
  return mpesa.initiateSubscriptionStkPush({ businessId: params.businessId, phone });
}

function deleteBusiness({ params, session }) {
  auth.requireAdmin(session);
  db.mutate((state) => {
    const idx = state.businesses.findIndex(b => b.id === params.businessId);
    if (idx === -1) throw db.httpError(404, "Business not found");
    const bid = params.businessId;
    const conversationIds = new Set(
      (state.conversations || []).filter(c => c.businessId === bid).map(c => c.id)
    );
    state.businesses.splice(idx, 1);
    state.accounts      = (state.accounts      || []).filter(a => a.businessId !== bid);
    state.subscriptions = (state.subscriptions || []).filter(s => s.businessId !== bid);
    state.customers     = (state.customers     || []).filter(c => c.businessId !== bid);
    state.orders        = (state.orders        || []).filter(o => o.businessId !== bid);
    state.products      = (state.products      || []).filter(p => p.businessId !== bid);
    state.conversations = (state.conversations || []).filter(c => c.businessId !== bid);
    state.messages      = (state.messages      || []).filter(m => !conversationIds.has(m.conversationId));
    state.reports       = (state.reports       || []).filter(r => r.businessId !== bid);
    state.videoScans    = (state.videoScans    || []).filter(s => s.businessId !== bid);
    state.stockMovements = (state.stockMovements || []).filter(m => m.businessId !== bid);
    state.sessions      = (state.sessions      || []).filter(s => s.businessId !== bid);
  });
  return { ok: true };
}

function suspendBusiness({ params, session }) {
  auth.requireAdmin(session);
  db.suspendBusiness(params.businessId);
  return { ok: true };
}

function unsuspendBusiness({ params, session }) {
  auth.requireAdmin(session);
  db.unsuspendBusiness(params.businessId);
  return { ok: true };
}

function getStats({ session }) {
  auth.requireAdmin(session);
  return db.getAdminStats();
}

function getGrowthSummary({ query, session }) {
  auth.requireAdmin(session);
  const requestedDays = Number(query && query.days);
  const days = Number.isFinite(requestedDays) ? Math.min(Math.max(Math.round(requestedDays), 1), 90) : 30;
  return db.getAdminGrowthSummary({ days });
}

// GET /api/admin/platform-defaults
// Returns the platform-level WABA ID and whether the system token is configured.
// The token itself is never sent to the browser — only a boolean flag.
function getPlatformDefaults({ session }) {
  auth.requireAdmin(session);
  // Keep the admin status aligned with whatsapp.resolveAccessToken(), which
  // still accepts the legacy shared-token and sender-ID variable names.
  const phoneNumberId =
    process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID ||
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    "1414909975031488";
  return {
    wabaId:   process.env.WHATSAPP_PLATFORM_WABA_ID || "1051176054371123",
    phoneNumberId,
    hasToken: Boolean(process.env.WHATSAPP_PLATFORM_TOKEN || process.env.WHATSAPP_TOKEN),
    hasWebhookVerifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
  };
}

async function setWhatsAppCredentials({ params, body, session }) {
  auth.requireAdmin(session);
  let { phoneNumberId, accessToken, verifyToken, wabaId, displayName, waPhone, profileImageDataUrl } = body || {};
  const business = db.getBusiness(params.businessId);
  if (!phoneNumberId) phoneNumberId = process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken) accessToken = process.env.WHATSAPP_PLATFORM_TOKEN || process.env.WHATSAPP_TOKEN;
  if (!wabaId) wabaId = process.env.WHATSAPP_PLATFORM_WABA_ID;
  if (!verifyToken) verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!waPhone) waPhone = business.pesaAiNumber || business.shopNumber || business.publicPhone || null;
  if (!displayName) displayName = business.name;
  if (!phoneNumberId) throw db.httpError(400, "WhatsApp Phone Number ID is required");
  if (!accessToken) throw db.httpError(503, "WhatsApp access token is not configured");

  db.setWhatsAppConnectionStatus(params.businessId, "connecting");
  let result;
  try {
    result = db.setWhatsAppCredentials(params.businessId, { phoneNumberId, accessToken, verifyToken, wabaId, displayName, waPhone });
  } catch (error) {
    db.setWhatsAppConnectionStatus(params.businessId, "failed", error.message);
    throw error;
  }
  let profilePictureUpdated = false;
  let webhookSubscribed = false;
  let webhookSubscriptionError = null;
  let vendorAlertSent = false;
  let connectionStatus = "connecting";
  const savedBusiness = db.getBusiness(params.businessId);

  if (result.connected) {
    try {
      await whatsapp.updateWhatsAppBusinessProfile(savedBusiness, phoneNumberId, accessToken);
    } catch (err) {
      console.warn(`[whatsapp] Business profile update failed: ${err.message}`);
    }
    if (profileImageDataUrl) {
      try {
        profilePictureUpdated = await whatsapp.updateWhatsAppProfilePicture(phoneNumberId, accessToken, profileImageDataUrl);
      } catch (err) {
        console.warn(`[whatsapp] QR profile picture update failed: ${err.message}`);
      }
    }
    if (wabaId) {
      try {
        webhookSubscribed = await whatsapp.subscribeWaba(wabaId, accessToken);
      } catch (err) {
        webhookSubscriptionError = err.message || "Meta WABA subscription failed";
        console.warn(`[whatsapp] WABA subscription failed: ${err.message}`);
      }
    }
    const setupLive = !wabaId || webhookSubscribed;
    connectionStatus = setupLive ? "live" : "failed";
    const connectionError = setupLive
      ? null
      : webhookSubscriptionError || "Meta WABA subscription did not complete";
    db.setWhatsAppConnectionStatus(params.businessId, connectionStatus, connectionError);
    const vendorPhone = setupLive ? (savedBusiness.personalPhone || null) : null;
    const shopDigits = db.normalizePhone(savedBusiness.whatsappNumber || savedBusiness.whatsappRequestedPhone || savedBusiness.pesaAiNumber || savedBusiness.shopPhone || waPhone || "");
    if (vendorPhone) {
      const shareLink = shopDigits ? " https://wa.me/" + shopDigits + "?text=Hi%2C%20I%27d%20like%20to%20shop" : "";
      try {
        await whatsapp.sendMessage(phoneNumberId, vendorPhone, "Shop yako " + savedBusiness.name + " iko LIVE!" + shareLink, accessToken);
        vendorAlertSent = true;
      } catch (err) {
        console.warn(`[whatsapp] Vendor live alert failed: ${err.message}`);
      }
    }
  }

  return {
    ...result,
    connected: Boolean(result.connected && connectionStatus === "live"),
    connectionStatus,
    connectionError: db.getWhatsAppStatus(params.businessId).connectionError,
    profilePictureUpdated,
    webhookSubscribed,
    vendorAlertSent,
    welcomeMessageReady: Boolean(db.getBusiness(params.businessId).welcomeMessage),
  };
}

function getWhatsAppStatus({ params, session }) {
  auth.requireAdmin(session);
  return db.getWhatsAppStatus(params.businessId);
}

function getPlatformDaraja({ session }) {
  auth.requireAdmin(session);
  return db.getPlatformDarajaStatus();
}

function setPlatformDaraja({ body, session }) {
  auth.requireAdmin(session);
  return db.setPlatformDaraja(body || {});
}

function setMpesaCredentials({ params, body, session }) {
  auth.requireAdmin(session);
  if (["consumerKey", "consumerSecret"].some((key) => Object.hasOwn(body || {}, key))) throw db.httpError(400, "App credentials belong in Pesa SI Daraja settings");
  return db.setMerchantStkPasskey(params.businessId, body?.passkey);
}

async function verifyMpesa({ params, body, session }) {
  auth.requireAdmin(session);
  if (body?.receivingAccountAuthorized !== true) throw db.httpError(400, "Confirm Safaricom authorization and ownership of this merchant receiving shortcode before enabling STK");
  if (db.getBusiness(params.businessId).paymentMethod === "bank") throw db.httpError(409, "Merchant selected bank transfer; select M-Pesa first");
  const credentials = db.getMpesaCredentialsDecrypted(params.businessId);
  if (!credentials) throw db.httpError(409, "Pesa SI app, merchant receiving number, and shortcode-specific STK Passkey must all be configured");
  const verification = await mpesa.verifyCredentials(params.businessId, credentials, process.env.PUBLIC_BASE_URL);
  if (!verification.ok) throw db.httpError(502, `Safaricom verification failed: ${verification.error || "Credential validation failed"}`);
  return db.verifyMpesaCredentials(params.businessId, "admin");
}

function getMpesaStatus({ params, session }) {
  auth.requireAdmin(session);
  return db.getMpesaStatus(params.businessId);
}

function disconnectMpesa({ params, session }) {
  auth.requireAdmin(session);
  return db.clearMpesaCredentials(params.businessId, "admin");
}

// Regenerate (or backfill) the welcome message for a business using its current data
function regenerateWelcomeMessage({ params, session }) {
  auth.requireAdmin(session);
  const business = db.getBusiness(params.businessId);
  const welcomeMessage = db.generateWelcomeMessage(business);
  db.updateBusiness(params.businessId, { welcomeMessage }, "admin");
  return { ok: true, welcomeMessage };
}

function resetPassword({ params, body, session }) {
  auth.requireAdmin(session);
  const { newPassword } = body || {};
  if (!newPassword || String(newPassword).length < 8) {
    throw db.httpError(400, "newPassword must be at least 8 characters");
  }
  const { passwordHash, passwordSalt } = auth.hashPassword(newPassword);
  return db.resetAccountPasswordByBusinessId(params.businessId, passwordHash, passwordSalt);
}

module.exports = {
  importDb,
  login, listBusinesses, chargeSubscription, deleteBusiness, suspendBusiness, unsuspendBusiness,
  getStats, getGrowthSummary, getPlatformDefaults, setWhatsAppCredentials, getWhatsAppStatus,
  getPlatformDaraja, setPlatformDaraja, setMpesaCredentials, verifyMpesa, getMpesaStatus, disconnectMpesa, resetPassword,
  regenerateWelcomeMessage,
};
