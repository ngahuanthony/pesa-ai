const db   = require("../db");
const auth = require("../auth");

// GET /api/businesses/:businessId/conversations
// Returns all conversations that need human attention (humanHandover=true).
function listHandover({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  return { conversations: db.getHandoverConversations(params.businessId) };
}

// POST /api/businesses/:businessId/conversations/:customerId/resume-ai
// Vendor has finished — hand the conversation back to the AI.
function resumeAI({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  // params.customerId is actually the customerPhone (used as an identifier in the URL)
  const phone = decodeURIComponent(params.customerId);
  db.setConversationHandover(params.businessId, phone, false);
  return { ok: true };
}

module.exports = { listHandover, resumeAI };
