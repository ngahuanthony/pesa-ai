const db = require("./db");

const SKYVIEW_THANK_YOU =
  "✨ *Thank You for Visiting Skyview Opal!*\n\nThank you for choosing *Skyview Opal Hotel*. It was our pleasure having you with us, and we hope you enjoyed your experience.\n\nWe look forward to welcoming you back again soon! 💙\n\n*Skyview Opal — We can’t wait to see you again!*";

const pendingThankYouOrderIds = new Set();

function isSkyviewBusiness(business) {
  return String(business?.name || "").trim().replace(/\s+/g, " ").toLowerCase() === "skyview opal hotel";
}

function isServedAndPaid(order) {
  const fulfillmentStatus = String(order?.fulfillmentStatus || order?.status || "").toUpperCase();
  return order?.paymentStatus === "PAID" && ["SERVED", "COMPLETED"].includes(fulfillmentStatus);
}

async function sendSkyviewThankYouIfEligible(orderId) {
  const order = db.getOrder(orderId);
  if (!order || !isServedAndPaid(order) || order.customerThankYouSentAt) return false;
  if (pendingThankYouOrderIds.has(order.id)) return false;

  const business = db.getBusiness(order.businessId);
  if (!isSkyviewBusiness(business)) return false;

  const customer = db.listOrders(order.businessId).find((candidate) => candidate.id === order.id);
  const whatsapp = require("./whatsapp");
  const token = whatsapp.resolveAccessToken(business);
  if (!business.whatsappPhoneNumberId || !customer?.customerPhone || !token) return false;

  pendingThankYouOrderIds.add(order.id);
  try {
    const sent = await whatsapp.sendMessage(
      business.whatsappPhoneNumberId,
      customer.customerPhone,
      SKYVIEW_THANK_YOU,
      token,
    );
    if (!sent) return false;
    db.markOrderThankYouSent(order.id);
    return true;
  } finally {
    pendingThankYouOrderIds.delete(order.id);
  }
}

module.exports = {
  SKYVIEW_THANK_YOU,
  isSkyviewBusiness,
  sendSkyviewThankYouIfEligible,
};
