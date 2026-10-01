const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-whatsapp-routing-"));
process.env.ENCRYPTION_KEY = "d".repeat(64);

const db = require("../db");

function createBusiness(name, phone) {
  return db.mutate((state) => db.createBusiness(state, {
    name,
    category: "Hospitality",
    merchantType: "hospitality",
    phone,
    pesaAiNumber: phone,
  }));
}

test.beforeEach(() => {
  db.mutate((state) => {
    state.businesses = [];
    state.accounts = [];
    state.subscriptions = [];
    state.migrations = {};
  });
});

test("corrects only the unique Skyview business matching its requested phone", () => {
  const skyview = createBusiness("SKYVIEW OPAL HOTEL", "254700000001");
  const annex = createBusiness("Skyview Opal Hotel Annex", "254700000002");
  const duplicateName = createBusiness("Skyview Opal Hotel", "254700000003");
  db.mutate((state) => {
    state.businesses.find((business) => business.id === skyview.id).whatsappRequestedPhone = "254182667245";
    state.businesses.find((business) => business.id === skyview.id).whatsappWabaId = "keep-waba";
    state.businesses.find((business) => business.id === skyview.id).whatsappAccessTokenEnc = "keep-token";
    state.businesses.find((business) => business.id === annex.id).whatsappRequestedPhone = "254700000002";
    state.businesses.find((business) => business.id === duplicateName.id).whatsappRequestedPhone = "254700000003";
  });

  const migrationId = "test-skyview-routing-unique";
  const result = db.runOneTimeExactWhatsAppPhoneNumberIdCorrection({
    businessName: "Skyview Opal Hotel",
    requestedPhone: "+2540182 667 245",
    phoneNumberId: "1391881137336168",
    migrationId,
  });

  const state = db.load();
  const updated = state.businesses.find((business) => business.id === skyview.id);
  assert.deepEqual(result, { applied: true, businessId: skyview.id });
  assert.equal(updated.whatsappPhoneNumberId, "1391881137336168");
  assert.equal(updated.whatsappWabaId, "keep-waba");
  assert.equal(updated.whatsappAccessTokenEnc, "keep-token");
  assert.equal(state.businesses.find((business) => business.id === annex.id).whatsappPhoneNumberId, null);
  assert.equal(state.businesses.find((business) => business.id === duplicateName.id).whatsappPhoneNumberId, null);
  assert.deepEqual(state.migrations[migrationId].fields, ["whatsappPhoneNumberId"]);
});

test("does not change routing when the requested phone matches multiple Skyview records", () => {
  const first = createBusiness("Skyview Opal Hotel", "254700000004");
  const second = createBusiness("SKYVIEW OPAL HOTEL", "254700000005");
  db.mutate((state) => {
    state.businesses.find((business) => business.id === first.id).whatsappRequestedPhone = "254182667245";
    state.businesses.find((business) => business.id === second.id).whatsappRequestedPhone = "+254 182 667 245";
  });

  const migrationId = "test-skyview-routing-ambiguous";
  const result = db.runOneTimeExactWhatsAppPhoneNumberIdCorrection({
    businessName: "Skyview Opal Hotel",
    requestedPhone: "254182667245",
    phoneNumberId: "1391881137336168",
    migrationId,
  });

  assert.deepEqual(result, { applied: false, reason: "business-match-count", matchCount: 2 });
  assert.equal(db.load().businesses.find((business) => business.id === first.id).whatsappPhoneNumberId, null);
  assert.equal(db.load().businesses.find((business) => business.id === second.id).whatsappPhoneNumberId, null);
  assert.equal(db.load().migrations[migrationId], undefined);
});

test("does not reassign a phone-number ID already owned by another business", () => {
  const skyview = createBusiness("Skyview Opal Hotel", "254700000006");
  const other = createBusiness("Other Duka", "254700000007");
  db.mutate((state) => {
    const target = state.businesses.find((business) => business.id === skyview.id);
    target.whatsappRequestedPhone = "254182667245";
    target.whatsappPhoneNumberId = "previous-skyview-id";
    state.businesses.find((business) => business.id === other.id).whatsappPhoneNumberId = "1391881137336168";
  });
  const before = db.load().businesses.find((business) => business.id === skyview.id);
  const migrationId = "test-skyview-routing-conflict";

  const result = db.runOneTimeExactWhatsAppPhoneNumberIdCorrection({
    businessName: "Skyview Opal Hotel",
    requestedPhone: "254182667245",
    phoneNumberId: "1391881137336168",
    migrationId,
  });

  assert.equal(result.reason, "phone-number-id-already-assigned");
  assert.equal(result.conflictingBusinessId, other.id);
  assert.deepEqual(db.load().businesses.find((business) => business.id === skyview.id), before);
  assert.equal(db.load().migrations[migrationId], undefined);
});