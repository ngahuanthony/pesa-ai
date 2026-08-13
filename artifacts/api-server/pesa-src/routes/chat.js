// The Chat Tester — lets you (the business owner) talk to your own AI
// assistant exactly as a WhatsApp customer would, without needing a real
// WhatsApp Business number set up yet.

const db = require("../db");
const auth = require("../auth");
const { handleCustomerMessage } = require("../core");

async function send({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const business = db.getBusiness(params.businessId);
  const { customerPhone, customerName, message } = body || {};
  if (!customerPhone || !message) {
    throw db.httpError(400, "customerPhone and message are required");
  }
  const result = await handleCustomerMessage({
    business,
    customerPhone,
    customerName,
    text: message,
    channel: "simulator",
  });
  return { replyText: result.replyText, order: result.order || null };
}

function history({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId);
  const customerPhone = params.customerPhone;
  if (!customerPhone) throw db.httpError(400, "customerPhone path param is required");
  const { messages } = db.getConversationHistory(params.businessId, customerPhone, 100);
  return messages;
}

module.exports = { send, history };
