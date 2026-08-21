const db = require("../db");
const auth = require("../auth");

function list({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId); // 404s if missing
  return db.listProducts(params.businessId);
}

function create({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const { name, description, price, stockQty, imageUrl } = body || {};
  if (!name || price === undefined || price === null || price === "") {
    throw db.httpError(400, "name and price are required");
  }
  if (Number.isNaN(Number(price)) || Number(price) < 0) {
    throw db.httpError(400, "price must be a non-negative number");
  }
  const product = db.createProduct(params.businessId, { name, description, price, stockQty, imageUrl, source: "manual" });
  return { status: 201, data: product };
}

function update({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const allowed = ["name", "description", "price", "stockQty", "imageUrl", "active"];
  const patch = {};
  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  return db.updateProduct(params.businessId, params.productId, patch);
}

function remove({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.deleteProduct(params.businessId, params.productId);
  return { status: 204 };
}

// Bulk import from a CSV/XLSX file the browser already parsed client-side
// (see public/app.js) — the server just gets plain row objects, so it
// never needs an npm dependency for spreadsheet parsing.
function importBulk({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId); // 404s if missing
  const rows = Array.isArray(body && body.rows) ? body.rows : null;
  if (!rows || rows.length === 0) {
    throw db.httpError(400, "rows must be a non-empty array");
  }
  if (rows.length > 2000) {
    throw db.httpError(400, "too many rows — import at most 2000 products at a time");
  }
  const result = db.bulkCreateProducts(params.businessId, rows);
  return { status: 201, data: result };
}

module.exports = { list, create, update, remove, importBulk };
