// routes/video-scan.js — vendor video-scan endpoints
//
// Upload is handled directly in server.js (needs raw binary body).
// This file provides: status, getScan, confirm.

const db = require("../db");
const auth = require("../auth");

// GET /api/businesses/:businessId/video-scan
// Returns the most recent scans for this business.
function listScans({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const scans = db.listVideoScans(params.businessId);
  return { scans };
}

// GET /api/businesses/:businessId/video-scan/:scanId
// Returns a single scan (status + product drafts).
function getScan({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const scan = db.getVideoScan(params.scanId);
  if (!scan || scan.businessId !== params.businessId) {
    throw db.httpError(404, "Scan not found");
  }
  return scan;
}

// POST /api/businesses/:businessId/video-scan/:scanId/confirm
// Vendor approves selected drafts → creates real products in inventory.
function confirmScan({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const scan = db.getVideoScan(params.scanId);
  if (!scan || scan.businessId !== params.businessId) {
    throw db.httpError(404, "Scan not found");
  }
  if (scan.status !== "done") {
    throw db.httpError(400, "Scan is not ready yet");
  }

  const products = body.products;
  if (!Array.isArray(products) || products.length === 0) {
    throw db.httpError(400, "No products to confirm");
  }

  // Validate and coerce
  const rows = products.map((p) => ({
    name: String(p.name || "").trim(),
    price: Number(p.price) || 0,
    description: String(p.description || "").trim(),
    stockQty: 0,
    imageUrl: null,
    source: "video_scan",
  })).filter((p) => p.name && p.price > 0);

  if (rows.length === 0) {
    throw db.httpError(400, "All products are missing a name or price");
  }

  const result = db.bulkCreateProducts(params.businessId, rows);
  db.updateVideoScan(params.scanId, { status: "confirmed" });
  return result;
}

// POST /api/businesses/:businessId/video-scan/:scanId/cancel
// Cancels a queued or in-progress scan that is stuck.
function cancelScan({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const scan = db.getVideoScan(params.scanId);
  if (!scan || scan.businessId !== params.businessId) {
    throw db.httpError(404, "Scan not found");
  }
  if (scan.status !== "pending" && scan.status !== "processing") {
    throw db.httpError(400, "Only queued or processing scans can be cancelled");
  }
  db.updateVideoScan(params.scanId, { status: "error", error: "Cancelled by vendor" });
  return { cancelled: true };
}

// PATCH /api/businesses/:businessId/video-scan/:scanId
// Rename a scan — lets vendors label their scans after the fact.
function renameScan({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const scan = db.getVideoScan(params.scanId);
  if (!scan || scan.businessId !== params.businessId) {
    throw db.httpError(404, "Scan not found");
  }
  const name = body && body.name != null ? String(body.name).trim().slice(0, 80) : null;
  db.updateVideoScan(params.scanId, { name });
  return { ok: true, name };
}

// DELETE /api/businesses/:businessId/video-scan/:scanId
// Lets a vendor remove a failed or unwanted scan from their history.
function deleteScan({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const scan = db.getVideoScan(params.scanId);
  if (!scan || scan.businessId !== params.businessId) {
    throw db.httpError(404, "Scan not found");
  }
  db.deleteVideoScan(params.scanId);
  return { deleted: true };
}

module.exports = { listScans, getScan, confirmScan, cancelScan, renameScan, deleteScan };
