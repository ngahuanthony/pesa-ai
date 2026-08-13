// Business creation now happens through POST /api/auth/signup (it needs to
// create the business + the owner's login account together). Listing every
// business is an admin-only concern (see routes/admin.js) — a client's
// business is not public data other clients should ever see. What's left
// here is just "read/update the one business I'm logged into."

const db = require("../db");
const auth = require("../auth");

function get({ params, session }) {
  auth.requireOwnBusiness(session, params.id);
  return db.sanitizeBusiness(db.getBusiness(params.id));
}

function update({ params, body, session }) {
  auth.requireOwnBusiness(session, params.id);
  const allowed = ["name", "category", "ownerName", "personaName", "personaInstructions", "paybillNumber", "whatsappPhoneNumberId", "paymentMethod", "bankName", "bankAccountNumber", "whatsappPhone", "buildingName", "shopNumber", "publicPhone"];
  const patch = {};
  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  // Only auto-derive personaName from name+category if the client isn't
  // explicitly setting it themselves (i.e. via the AI Persona section).
  if ((patch.name || patch.category) && !patch.personaName) {
    const current = db.getBusiness(params.id);
    patch.personaName = db.derivePersonaName(
      patch.name ?? current.name,
      patch.category ?? current.category
    );
  }
  const actor = session.accountId || "admin";
  return db.sanitizeBusiness(db.updateBusiness(params.id, patch, actor));
}

module.exports = { get, update };
