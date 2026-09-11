// Backfill data for the Hidden AI pricing and shop-number rollout.
// Run from artifacts/api-server with: node scripts/migrate-hidden-ai.js
// This does not invent WhatsApp Shop numbers; those must be supplied and verified by an admin.
const db = require("../pesa-src/db");

const result = db.mutate((state) => {
  let businessesUpdated = 0;
  let subscriptionsUpdated = 0;
  for (const business of state.businesses || []) {
    if (!business.personalPhone && (business.phone || business.businessPhoneNumber || business.whatsappNumber)) {
      business.personalPhone = business.phone || business.businessPhoneNumber || business.whatsappNumber;
      businessesUpdated += 1;
    }
    if (business.pesaAiNumber === undefined) business.pesaAiNumber = null;
    if (business.pesaAiNumberVerified === undefined) business.pesaAiNumberVerified = false;
  }
  for (const subscription of state.subscriptions || []) {
    const plan = db.getPlan(subscription.plan);
    if (plan && subscription.priceKES !== plan.priceKES) {
      subscription.priceKES = plan.priceKES;
      subscription.updatedAt = db.now();
      subscriptionsUpdated += 1;
    }
  }
  return { businessesUpdated, subscriptionsUpdated };
});

console.log(JSON.stringify({ ok: true, ...result }));
