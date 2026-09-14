const db = require("../db");

function validateKenyanPhone(phone) {
  const normalized = db.normalizePhone(phone);
  if (!/^254\d{9}$/.test(normalized)) {
    throw db.httpError(400, "Enter a complete Kenyan shop number, for example 0792 717 918");
  }
  return normalized;
}

function search({ query }) {
  const phone = validateKenyanPhone(query && query.phone);
  return {
    phone,
    shops: db.searchPublicShopsByPhone(phone),
  };
}

function get({ params }) {
  const shop = db.getPublicShopBySlug(params.slug);
  if (!shop) throw db.httpError(404, "Shop not found");
  return shop;
}

module.exports = { search, get };