const db = require("../db");
const auth = require("../auth");

function listDeni({ params, query, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId);
  return db.listDeniEntries(params.businessId, query.status || null);
}

function createDeni({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const entry = db.createDeniEntry(params.businessId, body || {}, session.accountId || "vendor");
  return { status: 201, data: entry };
}

function updateDeni({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  return db.updateDeniEntry(params.businessId, params.entryId, body || {}, session.accountId || "vendor");
}

function reportSettings({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  return db.getDailyReportSettings(params.businessId);
}

function updateReportSettings({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  return db.getDailyReportSettings(params.businessId) && db.updateDailyReportSettings(params.businessId, body || {}, session.accountId || "vendor");
}

module.exports = { listDeni, createDeni, updateDeni, reportSettings, updateReportSettings };
