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

function findByPhone({ query }) {
  return search({ query });
}

function get({ params }) {
  const shop = db.getPublicShopBySlug(params.slug);
  if (!shop) throw db.httpError(404, "Shop not found");
  return shop;
}

function searchProducts({ query }) {
  const businessId = String(query?.business_id || "").trim();
  const productQuery = String(query?.q || "").trim();
  if (!businessId) throw db.httpError(400, "business_id is required");
  if (!productQuery) throw db.httpError(400, "q is required");
  if (productQuery.length > 120) throw db.httpError(400, "q must be at most 120 characters");
  return {
    business_id: businessId,
    q: productQuery,
    variants: db.searchPublicProducts(businessId, productQuery),
  };
}

module.exports = { search, findByPhone, get, searchProducts };