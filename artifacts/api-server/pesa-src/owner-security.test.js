const test = require("node:test");
const assert = require("node:assert/strict");
const security = require("./owner-security");

test("TOTP matches RFC 6238 SHA-1 six-digit vectors", () => {
  const secret = security.encodeBase32(Buffer.from("12345678901234567890"));
  assert.equal(security.codeAtCounter(secret, 1), "287082");
  assert.equal(security.codeAtCounter(secret, 2), "359152");
  assert.equal(security.codeAtCounter(secret, 3), "969429");
});

test("TOTP verification accepts a current window once and rejects replay", () => {
  const secret = security.generateTotpSecret();
  const now = 1_800_000_000_000;
  const counter = Math.floor(now / 1000 / 30);
  const code = security.codeAtCounter(secret, counter);
  assert.equal(security.verifyTotp(secret, code, { now }), counter);
  assert.equal(security.verifyTotp(secret, code, { now, lastCounter: counter }), null);
  assert.equal(security.verifyTotp(secret, "wrong", { now }), null);
});

test("recovery codes are stored as hashes and can be consumed by exact match", () => {
  const { codes, hashes } = security.createRecoveryCodes(2);
  assert.equal(codes.length, 2);
  assert.equal(hashes[0].includes(codes[0]), false);
  assert.equal(security.recoveryCodeIndex(hashes, codes[0].toLowerCase()), 0);
  assert.equal(security.recoveryCodeIndex(hashes, "not-a-code"), -1);
});