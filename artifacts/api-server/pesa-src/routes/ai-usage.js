const db = require("../db");
const auth = require("../auth");

function get({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  return db.getBusinessAiUsage(params.businessId, 30);
}

module.exports = { get };
