// Plain HTTP handler functions — wired into server.js route table.
// No express dependency; matches the pattern used by all other route files.

const db = require("../db");
const auth = require("../auth");

const VALID_REASONS = ["scam", "no_delivery", "wrong_product", "other"];

function create({ body }) {
  const { businessId, reason, details, reporterContact } = body || {};
  if (!businessId || !reason) {
    throw db.httpError(400, "businessId and reason are required");
  }
  if (!VALID_REASONS.includes(reason)) {
    throw db.httpError(400, `reason must be one of: ${VALID_REASONS.join(", ")}`);
  }
  const report = db.createReport({ businessId, reason, details, reporterContact });
  return { status: 201, data: { ok: true, reportId: report.id } };
}

function list({ session }) {
  auth.requireAdmin(session);
  return db.getReportsGroupedByBusiness();
}

function updateStatus({ params, body, session }) {
  auth.requireAdmin(session);
  const { status } = body || {};
  if (!["reviewed", "dismissed", "open"].includes(status)) {
    throw db.httpError(400, "status must be reviewed, dismissed, or open");
  }
  const updated = db.updateReportStatus(params.id, status);
  if (!updated) throw db.httpError(404, "report not found");
  return { ok: true, report: updated };
}

module.exports = { create, list, updateStatus };
