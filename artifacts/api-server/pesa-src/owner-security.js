const crypto = require("crypto");

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value) {
  const normalized = String(value || "").toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid authenticator secret");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

function codeAtCounter(secret, counter) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function verifyTotp(secret, code, { now = Date.now(), lastCounter = -1, window = 1 } = {}) {
  const candidate = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(candidate)) return null;
  const currentCounter = Math.floor(Number(now) / 1000 / STEP_SECONDS);
  for (let offset = -window; offset <= window; offset += 1) {
    const counter = currentCounter + offset;
    if (counter <= lastCounter || counter < 0) continue;
    const expected = Buffer.from(codeAtCounter(secret, counter));
    const actual = Buffer.from(candidate);
    if (expected.length === actual.length && crypto.timingSafeEqual(expected, actual)) return counter;
  }
  return null;
}

function createRecoveryCodes(count = 10) {
  const codes = Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(10).toString("hex").toUpperCase();
    return `${raw.slice(0, 10)}-${raw.slice(10)}`;
  });
  return {
    codes,
    hashes: codes.map(hashRecoveryCode),
  };
}

function normalizeRecoveryCode(code) {
  return String(code || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function hashRecoveryCode(code) {
  return crypto.createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

function recoveryCodeIndex(hashes, code) {
  const candidate = Buffer.from(hashRecoveryCode(code), "hex");
  for (let index = 0; index < (hashes || []).length; index += 1) {
    const saved = Buffer.from(String(hashes[index]), "hex");
    if (candidate.length === saved.length && crypto.timingSafeEqual(candidate, saved)) return index;
  }
  return -1;
}

function provisioningUri({ secret, email }) {
  const label = encodeURIComponent(`Pesa SI:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer: "Pesa SI",
    algorithm: "SHA1",
    digits: "6",
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = {
  createRecoveryCodes,
  decodeBase32,
  encodeBase32,
  generateTotpSecret,
  hashRecoveryCode,
  provisioningUri,
  recoveryCodeIndex,
  verifyTotp,
  codeAtCounter,
};