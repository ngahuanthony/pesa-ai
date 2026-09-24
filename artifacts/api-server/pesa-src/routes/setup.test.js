const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-si-setup-"));
const db = require("../db");
const drafts = require("../setup-drafts");
const routes = require("./setup");
const authRoutes = require("./auth");

const details = {
  businessName: "New Accessories",
  merchantType: "retail",
  personalPhone: "254700100001",
  pesaAiNumber: "254700100002",
  location: "Nairobi",
};

test("setup access is private and does not create a live merchant or products", () => {
  const created = routes.start({ body: details, req: { headers: {} } });
  assert.match(created.cookie, /^pesa_setup=[a-f0-9]{64};.*HttpOnly; SameSite=Lax/);
  assert.equal(created.data.draft.businessName, details.businessName);
  assert.equal(created.data.draft.secretHash, undefined);
  assert.equal(db.load().businesses.length, 0);
  assert.equal(db.load().products.length, 0);
  assert.throws(() => routes.get({ req: { headers: {} } }), /not available in this browser/);

  const token = created.cookie.match(/^pesa_setup=([a-f0-9]{64})/)[1];
  const req = { headers: { cookie: `pesa_setup=${token}` } };
  const updated = routes.addProduct({ req, body: { name: "Charger", description: "USB-C", price: 400, stockQty: 3 } });
  assert.equal(updated.draft.products[0].name, "Charger");
  assert.equal(db.load().products.length, 0);
  assert.equal(routes.get({ req }).draft.products.length, 1);
  assert.throws(() => routes.get({ req: { headers: { cookie: "pesa_setup=" + "a".repeat(64) } } }), /not available in this browser/);

  const pending = db.mutate((state) => db.createPendingSignup(state, details));
  assert.throws(() => db.finalizePendingSignup(pending.id, { draftToken: token }), /Both phone numbers must be verified/);
  db.markPendingSignupChannelVerified(pending.id, "personal");
  assert.throws(() => db.finalizePendingSignup(pending.id, { draftToken: token }), /Both phone numbers must be verified/);
  db.markPendingSignupChannelVerified(pending.id, "shop");
  const { business } = db.finalizePendingSignup(pending.id, { draftToken: token });
  assert.equal(business.location, "Nairobi");
  const imported = db.listProducts(business.id);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].active, true);
  assert.equal(db.listProducts(business.id, { activeOnly: true }).length, 1);
  assert.equal(imported[0].name, "Charger");
  assert.throws(() => routes.get({ req }), /not available in this browser/);
});

test("a different shop cannot import someone else's draft", () => {
  const { token } = drafts.start({ ...details, businessName: "Other Draft", personalPhone: "254700100011", pesaAiNumber: "254700100012" });
  drafts.addProduct(token, { name: "Private Item", price: 500, stockQty: 1 });
  const pending = db.mutate((state) => db.createPendingSignup(state, {
    businessName: "Verified Shop", merchantType: "retail",
    personalPhone: "254700100021", pesaAiNumber: "254700100022",
  }));
  db.markPendingSignupChannelVerified(pending.id, "personal");
  db.markPendingSignupChannelVerified(pending.id, "shop");
  const { business } = db.finalizePendingSignup(pending.id, { draftToken: token });
  assert.equal(db.listProducts(business.id).length, 0);
  assert.equal(drafts.get(token).products.length, 1);
});

test("verified signup imports only the matching browser draft through the normal OTP route", async () => {
  const info = { ...details, businessName: "Verified Draft", personalPhone: "254700100031", pesaAiNumber: "254700100032" };
  const { token } = drafts.start(info);
  drafts.addProduct(token, { name: "Adapter", price: 650, stockQty: 4 });
  const pending = db.mutate((state) => db.createPendingSignup(state, info));
  const personal = db.createOtpChallenge(info.personalPhone, "signup_personal", { pendingSignupId: pending.id });
  const shop = db.createOtpChallenge(info.pesaAiNumber, "signup_shop", { pendingSignupId: pending.id });
  const req = { headers: { cookie: `pesa_setup=${token}` } };
  const first = await authRoutes.verifySignupOtp({ body: { pendingSignupId: pending.id, channel: "personal", code: personal.code }, req });
  assert.equal(first.data.next, "shop");
  assert.equal(db.load().businesses.some((item) => item.name === info.businessName), false);
  const final = await authRoutes.verifySignupOtp({ body: { pendingSignupId: pending.id, channel: "shop", code: shop.code }, req });
  assert.match(final.cookie, /^pesaai_session=/);
  assert.equal(final.data.business.name, info.businessName);
  assert.equal(db.listProducts(final.data.business.id, { activeOnly: true })[0].name, "Adapter");
});

test("draft throttling separates clients behind one proxy and ignores spoofed forwarded hops", () => {
  const proxy = { remoteAddress: "10.0.0.1" };
  const first = { headers: { "x-real-ip": "203.0.113.77", "x-forwarded-for": "198.51.100.1, 203.0.113.77" }, socket: proxy };
  for (let i = 0; i < 10; i++) assert.ok(drafts.start({ ...details, businessName: `Draft ${i}` }, null, first).token);
  const spoofed = { headers: { "x-real-ip": "203.0.113.77", "x-forwarded-for": "198.51.100.2, 203.0.113.77" }, socket: proxy };
  assert.throws(() => drafts.start({ ...details, businessName: "Eleventh" }, null, spoofed), /Too many setup drafts started/);
  const second = { headers: { "x-real-ip": "203.0.113.78", "x-forwarded-for": "198.51.100.1, 203.0.113.78" }, socket: proxy };
  assert.ok(drafts.start({ ...details, businessName: "Different Client" }, null, second).token);
});

test("a direct client cannot evade the draft limit by spoofing forwarded headers", () => {
  for (let i = 0; i < 10; i++) {
    const req = { headers: { "x-forwarded-for": `203.0.113.${i}`, "x-real-ip": `203.0.113.${i}` }, socket: { remoteAddress: "198.51.100.99" } };
    assert.ok(drafts.start({ ...details, businessName: `Direct ${i}` }, null, req).token);
  }
  const spoofed = { headers: { "x-forwarded-for": "203.0.113.200" }, socket: { remoteAddress: "198.51.100.99" } };
  assert.throws(() => drafts.start({ ...details, businessName: "Blocked Direct" }, null, spoofed), /Too many setup drafts started/);
});