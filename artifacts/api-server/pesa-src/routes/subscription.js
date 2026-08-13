const db = require("../db");
const auth = require("../auth");
const mpesa = require("../mpesa");

function get({ params, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  return db.getSubscription(params.businessId);
}

async function charge({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const business = db.getBusiness(params.businessId);
  const phone = (body && body.phone) || business.phone;
  return mpesa.initiateSubscriptionStkPush({ businessId: params.businessId, phone });
}

// Switches a business between the Starter/Business/Pro tiers. Takes effect
// immediately (no proration) — the next charge bills the new plan's price.
function changePlan({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const planId = body && body.plan;
  if (!db.PLANS[planId]) {
    throw db.httpError(400, `Unknown plan "${planId}" — expected one of: ${db.PLAN_ORDER.join(", ")}`);
  }
  const actor = session.accountId || "admin";
  return db.changeSubscriptionPlan(params.businessId, planId, actor);
}

module.exports = { get, charge, changePlan };
