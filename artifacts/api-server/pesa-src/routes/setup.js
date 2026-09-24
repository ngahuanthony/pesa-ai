const drafts = require("../setup-drafts");

function start({ body, req }) {
  const result = drafts.start(body || {}, drafts.tokenFromRequest(req), req);
  if (result.token) return { cookie: drafts.cookie(result.token), status: 201, data: { draft: result.draft } };
  return { draft: result.draft };
}

function get({ req }) {
  return { draft: drafts.get(drafts.tokenFromRequest(req)) };
}

function update({ body, req }) {
  return { draft: drafts.update(drafts.tokenFromRequest(req), body || {}) };
}

function addProduct({ body, req }) {
  return { draft: drafts.addProduct(drafts.tokenFromRequest(req), body || {}) };
}

function changeProduct({ params, body, req }) {
  return { draft: drafts.changeProduct(drafts.tokenFromRequest(req), params.id, body || {}) };
}

function removeProduct({ params, req }) {
  return { draft: drafts.removeProduct(drafts.tokenFromRequest(req), params.id) };
}

module.exports = { start, get, update, addProduct, changeProduct, removeProduct };