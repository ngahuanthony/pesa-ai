// Field-level encryption for sensitive data at rest — AES-256-GCM via
// Node's built-in crypto module, so this needs no npm install (same
// philosophy as auth.js's scrypt password hashing).
//
// Why encrypt these specific fields and nothing else in the app: a
// paybill number is already semi-public (a business prints it on
// receipts and reads it out to customers over the phone) — but a Daraja
// Consumer Secret or Passkey is a real API credential that would let
// someone else initiate M-Pesa payment requests against a business's own
// account if it leaked. Treat those like passwords, not like contact
// details, and never send the decrypted (or even encrypted) value back
// to the browser once saved — see db.js's sanitizeBusiness().
//
// Keyed off ENCRYPTION_KEY, which must live only in the server's real
// environment (e.g. Render's Environment tab) — never in the repo or the
// JSON data file. Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended nonce length for GCM

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set on the server — required to store or read M-Pesa credentials. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
        "and set it in the server's environment (never commit it to the repo)."
    );
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes) for AES-256-GCM.");
  }
  return key;
}

// Returns a single self-contained string: "<iv>:<authTag>:<ciphertext>"
// (all hex-encoded) — or null for empty input, so callers can round-trip
// "no value set" without a separate null-check everywhere.
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

function decrypt(encoded) {
  if (!encoded) return null;
  const key = getKey();
  const parts = String(encoded).split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted value");
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// Lets callers fail with one clear setup error only when a business
// actually tries to save M-Pesa credentials, rather than crashing the
// whole server at boot just because ENCRYPTION_KEY hasn't been set yet
// (e.g. a fresh local dev checkout that isn't touching payments today).
function isConfigured() {
  return Boolean(process.env.ENCRYPTION_KEY);
}

// Masks a shortcode/paybill for display, e.g. "174379" -> "••••79".
// Real secrets (Consumer Secret, Passkey) are never sent to the browser
// at all, encrypted or not — this is only for the one semi-public
// identifier it's useful to show back for "yes, this is the right one".
function maskShortcode(value) {
  if (!value) return null;
  const str = String(value);
  if (str.length <= 2) return "••";
  return `••${str.slice(-2)}`;
}

module.exports = { encrypt, decrypt, isConfigured, maskShortcode };
