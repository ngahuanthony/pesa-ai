// server/src/auth.js
//
// Core session + password handling — no external dependencies (uses
// Node's built-in crypto, per the project's zero-npm-install design).
// This is the module every route file does `require("../auth")` for;
// it does NOT define any HTTP routes itself (those live in
// src/routes/auth.js).

const crypto = require("crypto");
const db = require("./db");

const SCRYPT_KEYLEN = 64;

// --- Password hashing (scrypt) --------------------------------------------

function hashPassword(password) {
  const passwordSalt = crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto.scryptSync(password, passwordSalt, SCRYPT_KEYLEN).toString("hex");
  return { passwordHash, passwordSalt };
}

function verifyPassword(password, passwordHash, passwordSalt) {
  if (!passwordHash || !passwordSalt) return false;
  const candidateHash = crypto.scryptSync(password, passwordSalt, SCRYPT_KEYLEN).toString("hex");
  const a = Buffer.from(candidateHash, "hex");
  const b = Buffer.from(passwordHash, "hex");
  if (a.length !== b.length) return false;
  // Constant-time comparison — avoids leaking hash-match progress via timing.
  return crypto.timingSafeEqual(a, b);
}

// --- Session cookie ---------------------------------------------------------

// Builds a Set-Cookie header value. Pass a session token to set it, or
// call with (null, { clear: true }) to expire/clear the cookie on logout.
function sessionCookieHeader(token, { clear = false } = {}) {
  const name = db.SESSION_COOKIE_NAME;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  if (clear || !token) {
    return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  }
  const maxAgeSeconds = 30 * 24 * 60 * 60; // 30 days — matches db.js's SESSION_TTL_MS
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

// Reads the session cookie off an incoming request and resolves it to a
// live session record (or null if missing/expired). Called once per
// request in server.js and passed down to every route handler.
function resolveSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[db.SESSION_COOKIE_NAME];
  if (!token) return null;
  return db.getSession(token);
}

// --- Guards ------------------------------------------------------------------

function requireAdmin(session) {
  if (!session || !session.isAdmin) {
    throw db.httpError(401, "Admin login required");
  }
}

function requireBusinessAccess(session, businessId) {
  if (!session || session.isAdmin || session.businessId !== businessId) {
    throw db.httpError(403, "Not authorized for this business");
  }
}

// requireOwnBusiness is an alias for requireBusinessAccess used by route files
const requireOwnBusiness = requireBusinessAccess;

module.exports = {
  hashPassword,
  verifyPassword,
  sessionCookieHeader,
  resolveSession,
  requireAdmin,
  requireBusinessAccess,
  requireOwnBusiness,
};
