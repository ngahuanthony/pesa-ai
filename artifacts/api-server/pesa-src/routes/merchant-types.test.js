const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pesa-si-types-"));
const db = require("../db");
const businessRoutes = require("./business");

test("signup groups legacy hotel and hospitality into one merchant type", () => {
  for (const [value, expected] of [
    ["retail", "retail"],
    ["hotel", "hospitality"],
    ["hospitality", "hospitality"],
    ["service", "service"],
    ["other", "other"],
  ]) {
    const state = { businesses: [], pendingSignups: [] };
    const pending = db.createPendingSignup(state, {
      businessName: "Example", personalPhone: "254700000001",
      pesaAiNumber: "254700000002", merchantType: value,
    });
    assert.equal(pending.merchantType, expected);
  }
});

test("signup reports a saved shop-number conflict without claiming WhatsApp checked it", () => {
  db.mutate((state) => db.createBusiness(state, {
    name: "Existing Shop",
    phone: "254700000021",
    pesaAiNumber: "254700000022",
  }));

  assert.throws(
    () => db.mutate((state) => db.createPendingSignup(state, {
      businessName: "New Shop",
      personalPhone: "254700000023",
      pesaAiNumber: "0700000022",
    })),
    /public shop number is already registered to a Pesa SI shop/
  );
});

test("an expired signup reservation does not permanently block a new line", () => {
  const state = {
    businesses: [],
    pendingSignups: [{
      id: "expired",
      pesaAiNumber: "254700000032",
      expiresAt: "2020-01-01T00:00:00.000Z",
    }],
  };
  const pending = db.createPendingSignup(state, {
    businessName: "Retry Shop",
    personalPhone: "254700000033",
    pesaAiNumber: "0700000032",
  });
  assert.equal(pending.pesaAiNumber, "254700000032");
});

test("existing hotel accounts display as hospitality and save the unified type", () => {
  const business = db.mutate((state) => db.createBusiness(state, {
    name: "Existing Hotel", phone: "254700000011", merchantType: "hospitality",
  }));
  db.updateBusiness(business.id, { merchantType: "hotel" }, "test");
  assert.equal(db.sanitizeBusiness(db.getBusiness(business.id)).merchantType, "hospitality");
  const updated = businessRoutes.update({
    params: { id: business.id }, session: { businessId: business.id },
    body: { merchantType: "hotel" },
  });
  assert.equal(updated.merchantType, "hospitality");
  assert.equal(db.getBusiness(business.id).merchantType, "hospitality");
  assert.throws(() => businessRoutes.update({
    params: { id: business.id }, session: { businessId: business.id },
    body: { merchantType: "unknown" },
  }), /merchantType must be/);
});