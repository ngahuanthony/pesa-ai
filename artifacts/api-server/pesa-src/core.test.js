const test = require("node:test");
const assert = require("node:assert/strict");
const { HOTEL_SHOP_LINK_TRIGGER, SHOP_LINK_TRIGGER, isShopLinkTrigger } = require("./core");
const db = require("./db");

test("recognizes the Skyview hotel QR prompt and legacy shop trigger", () => {
  assert.equal(isShopLinkTrigger(HOTEL_SHOP_LINK_TRIGGER), true);
  assert.equal(isShopLinkTrigger(`  ${HOTEL_SHOP_LINK_TRIGGER.toUpperCase()}  `), true);
  assert.equal(isShopLinkTrigger(SHOP_LINK_TRIGGER), true);
  assert.equal(isShopLinkTrigger("Hi Skyview Opal Hotel, I need a room"), false);
});

test("Skyview gets hotel-specific default welcome and scan copy", () => {
  const welcome = db.generateWelcomeMessage({ name: "Skyview Opal Hotel" });
  assert.match(welcome, /WELCOME TO SKYVIEW OPAL HOTEL/);
  assert.match(welcome, /dine, stay, relax, swim, meet or celebrate/);
  assert.match(welcome, /Your comfort\. Your experience\. Your moment\./);
  assert.equal(db.generateShopEntryPrompt(" SKYVIEW OPAL HOTEL ").toLowerCase(), HOTEL_SHOP_LINK_TRIGGER);
  assert.equal(db.generateShopEntryPrompt("Other Shop"), "Hi, I'd like to shop");
});

test("normalizes Kenyan international numbers without a duplicate trunk zero", () => {
  assert.equal(db.normalizePhone("+254 0712 345 678"), "254712345678");
  assert.equal(db.normalizePhone("0712 345 678"), "254712345678");
  assert.equal(typeof db.runOneTimeWhatsAppNumberCorrection, "function");
});