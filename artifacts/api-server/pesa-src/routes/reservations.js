const db = require("../db");
const auth = require("../auth");
const whatsapp = require("../whatsapp");

function own(session, businessId) {
  auth.requireOwnBusiness(session, businessId);
  const business = db.getBusiness(businessId);
  if (!db.isHospitalityBusiness(business)) {
    throw db.httpError(404, "Room reservations are only available for hospitality businesses");
  }
  return business;
}

function list({ params, session }) {
  own(session, params.businessId);
  return db.listRoomReservations(params.businessId);
}

async function update({ params, body, session }) {
  own(session, params.businessId);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw db.httpError(400, "Reservation update body is required");
  }
  const allowed = new Set(["status", "quotedAmount", "paymentStatus", "paymentReference", "staffNotes"]);
  const unknown = Object.keys(body).find((key) => !allowed.has(key));
  if (unknown) throw db.httpError(400, `Unsupported reservation field: ${unknown}`);
  const previous = db.getRoomReservation(params.businessId, params.reservationId);
  const updated = db.updateRoomReservation(params.businessId, params.reservationId, body);
  if (previous?.status === "PENDING" && ["CONFIRMED", "DECLINED"].includes(updated.status)) {
    try {
      await whatsapp.notifyReservationDecision(db.getBusiness(params.businessId), updated);
    } catch (error) {
      console.warn("[reservations] Could not send guest decision notice:", error.message);
    }
  }
  return updated;
}

module.exports = { list, update };