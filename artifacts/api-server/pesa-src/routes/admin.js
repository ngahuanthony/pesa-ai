// Internal oversight for Adplay Media Ltd staff — not something client
// businesses see. Protected by a single shared password (ADMIN_PASSWORD in
// .env), not a per-person account system — fine for a small internal team,
// revisit if that team grows or needs individual audit trails.

const db = require("../db");
const auth = require("../auth");
const mpesa = require("../mpesa");
const fieldCrypto = require("../crypto");

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

function setWhatsAppCredentials({ params, body, session }) {
  auth.requireAdmin(session);
  const { phoneNumberId, accessToken, verifyToken } = body || {};
  return db.setWhatsAppCredentials(params.businessId, { phoneNumberId, accessToken, verifyToken });
}

function getWhatsAppStatus({ params, session }) {
  auth.requireAdmin(session);
  return db.getWhatsAppStatus(params.businessId);
}

function setMpesaCredentials({ params, body, session }) {
  auth.requireAdmin(session);
  if (!fieldCrypto.isConfigured()) {
    throw db.httpError(503, "ENCRYPTION_KEY is not set on the server — add it in environment secrets before saving M-Pesa credentials.");
  }
  const { consumerKey, consumerSecret, passkey, shortcode } = body || {};
  if (!consumerKey || !consumerSecret || !passkey || !shortcode) {
    throw db.httpError(400, "consumerKey, consumerSecret, passkey and shortcode are all required");
  }
  return db.setMpesaCredentials(params.businessId, { consumerKey, consumerSecret, passkey, shortcode }, "admin");
}

function getMpesaStatus({ params, session }) {
  auth.requireAdmin(session);
  return db.getMpesaStatus(params.businessId);
}

function disconnectMpesa({ params, session }) {
  auth.requireAdmin(session);
  return db.clearMpesaCredentials(params.businessId, "admin");
}

module.exports = {
  login, listBusinesses, chargeSubscription, suspendBusiness, unsuspendBusiness,
  getStats, setWhatsAppCredentials, getWhatsAppStatus,
  setMpesaCredentials, getMpesaStatus, disconnectMpesa,
};
