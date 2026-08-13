/*
  NEW FILE: server/src/routes/reports.js
  Wire this into your router.js alongside your other route files.
  Assumes Express-style routing based on your README's routes/ folder.
*/

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../auth'); // adjust to your actual admin-auth middleware

// POST /api/reports
// Public — called from the Chat Tester / WhatsApp flow when a customer
// flags a business. No auth required, but keep it rate-limited if you
// have rate-limiting middleware already, to avoid spam/report-flooding.
router.post('/api/reports', (req, res) => {
  const { businessId, reason, details, reporterContact } = req.body;

  if (!businessId || !reason) {
    return res.status(400).json({ error: 'businessId and reason are required' });
  }

  const validReasons = ['scam', 'no_delivery', 'wrong_product', 'other'];
  if (!validReasons.includes(reason)) {
    return res.status(400).json({ error: 'invalid reason' });
  }

  const report = db.createReport({ businessId, reason, details, reporterContact });
  res.status(201).json({ ok: true, reportId: report.id });
});

// GET /api/admin/reports
// Admin-only — powers the new Reports tab in admin.html
router.get('/api/admin/reports', requireAdmin, (req, res) => {
  const grouped = db.getReportsGroupedByBusiness();
  res.json(grouped);
});

// PATCH /api/admin/reports/:id
// Admin-only — mark a report reviewed/dismissed. Suspending a business
// itself should stay a separate, explicit admin action elsewhere —
// this route only ever changes report status, never account status.
router.patch('/api/admin/reports/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['reviewed', 'dismissed', 'open'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  const updated = db.updateReportStatus(req.params.id, status);
  if (!updated) return res.status(404).json({ error: 'report not found' });
  res.json({ ok: true, report: updated });
});

module.exports = router;
