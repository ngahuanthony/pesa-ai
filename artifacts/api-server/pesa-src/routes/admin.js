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

// GET /api/admin/platform-defaults
// Returns the platform-level WABA ID and whether the system token is configured.
// The token itself is never sent to the browser — only a boolean flag.
function getPlatformDefaults({ session }) {
  auth.requireAdmin(session);
  return {
    wabaId:   process.env.WHATSAPP_PLATFORM_WABA_ID || "",
    hasToken: !!process.env.WHATSAPP_PLATFORM_TOKEN,
  };
}

async function setWhatsAppCredentials({ params, body, session }) {
  auth.requireAdmin(session);
  let { phoneNumberId, accessToken, verifyToken, wabaId, displayName, waPhone } = body || {};

  // Fall back to platform-level credentials if admin left them blank
  if (!accessToken && process.env.WHATSAPP_PLATFORM_TOKEN) {
    accessToken = process.env.WHATSAPP_PLATFORM_TOKEN;
  }
  if (!wabaId && process.env.WHATSAPP_PLATFORM_WABA_ID) {
    wabaId = process.env.WHATSAPP_PLATFORM_WABA_ID;
  }

  // Auto-derive display name from business name if admin didn't set one
  if (!displayName) {
    const business = db.getBusiness(params.businessId);
    displayName = business.name;
  }

  const result = db.setWhatsAppCredentials(params.businessId, { phoneNumberId, accessToken, verifyToken, wabaId, displayName, waPhone });

  // After credentials are saved, push the business profile to Meta so
  // customers see the correct name, category and description on WhatsApp.
  // Do this in the background — don't let a Meta API hiccup block the response.
  if (result.connected && phoneNumberId && accessToken) {
    const business = db.getBusiness(params.businessId);
    whatsapp.updateWhatsAppBusinessProfile(business, phoneNumberId, accessToken).catch(() => {});
  }

  return result;
}

function getWhatsAppStatus({ params, session }) {
  auth.requireAdmin(session);
  return db.getWhatsAppStatus(params.businessId);
}

async function setMpesaCredentials({ params, body, session }) {
  auth.requireAdmin(session);
  if (!fieldCrypto.isConfigured()) {
    throw db.httpError(503, "ENCRYPTION_KEY is not set on the server — add it in environment secrets before saving M-Pesa credentials.");
  }
  const { consumerKey, consumerSecret, passkey, shortcode } = body || {};
  if (!consumerKey || !consumerSecret || !passkey || !shortcode) {
    throw db.httpError(400, "consumerKey, consumerSecret, passkey and shortcode are all required");
  }
  const result = db.setMpesaCredentials(params.businessId, { consumerKey, consumerSecret, passkey, shortcode }, "admin");

  // Register C2B webhook URLs with Safaricom in the background so we're
  // notified whenever a customer manually pays to this business's paybill/till.
  if (result.connected) {
    const credentials = db.getMpesaCredentialsDecrypted(params.businessId);
    if (credentials) {
      mpesa.registerC2BUrls(params.businessId, credentials, process.env.PUBLIC_BASE_URL).catch((err) => {
        console.warn(`[admin] C2B registration error for ${params.businessId}: ${err.message}`);
      });
    }
  }

  return result;
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
  login, listBusinesses, chargeSubscription, suspendBusiness, unsuspendBusiness,
  getStats, getPlatformDefaults, setWhatsAppCredentials, getWhatsAppStatus,
  setMpesaCredentials, getMpesaStatus, disconnectMpesa, resetPassword,
  regenerateWelcomeMessage,
};
