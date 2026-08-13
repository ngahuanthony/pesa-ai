const db = require("../db");
const auth = require("../auth");

function summary({ params, query, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId); // 404s if missing
  const requestedDays = Number(query.days);
  const days = Number.isFinite(requestedDays) ? Math.min(Math.max(Math.round(requestedDays), 1), 90) : 14;
  const result = db.getSalesSummary(params.businessId, { days });

  // Basic analytics (totals) ship on every plan; the revenue trend and
  // top-products breakdown are the "Advanced analytics" Business+ feature.
  const subscription = db.getSubscription(params.businessId);
  if (!db.planHasFeature(subscription.plan, "advancedAnalytics")) {
    const { topProducts, trend, ...basic } = result;
    return { ...basic, advancedAnalyticsLocked: true };
  }
  return result;
}

module.exports = { summary };
