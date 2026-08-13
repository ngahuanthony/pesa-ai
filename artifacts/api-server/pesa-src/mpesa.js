// M-Pesa (Safaricom Daraja API) — order payments now use the PASS-THROUGH
// model: each business connects their own Daraja app (Settings tab), and
// a real STK push is sent using THEIR OWN shortcode/passkey, so a paying
// customer's money lands directly in that business's own paybill. Pesa AI
// (Adplay Media Ltd) never collects or holds a business's sales revenue —
// deliberately, since actually intermediating other people's money would
// bring a very different set of regulatory obligations (Central Bank of
// Kenya Payment Service Provider licensing under the National Payment
// System Act) than "we help you collect your own payments" does.
//
// If a business HASN'T connected their own paybill yet, order payment
// falls back to the original simulated flow so the rest of the app (and
// the demo/trial experience) still works with zero setup.
//
// IMPORTANT — this real STK push implementation is written to Safaricom's
// documented Daraja API shape but has not been exercised against the live
// sandbox in this environment (no test credentials, no outbound network
// access to safaricom.co.ke here). Test it end-to-end against the Daraja
// sandbox with a real test business before relying on it in production.
//
// Adplay's OWN subscription billing (businesses paying Adplay, not their
// customers paying them) is a different, simpler case — Adplay collecting
// its own revenue isn't aggregation — and is left as the existing
// simulated stub below; wire it up the same way once you're ready, using
// Adplay's own single Daraja app via MPESA_* env vars.

const db = require("./db");

const DARAJA_BASE =
  process.env.MPESA_ENV === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

function darajaTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Kenyan MSISDNs for Daraja must be in 2547XXXXXXXX / 2541XXXXXXXX format.
function normalizeMsisdn(phone) {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  return `254${digits}`;
}

async function getAccessToken(consumerKey, consumerSecret) {
  const basicAuth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const res = await fetch(`${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basicAuth}` },
  });
  if (!res.ok) {
    throw db.httpError(502, "Could not authenticate with Safaricom Daraja — check this business's M-Pesa credentials in Settings.");
  }
  const data = await res.json();
  if (!data.access_token) {
    throw db.httpError(502, "Safaricom Daraja did not return an access token.");
  }
  return data.access_token;
}

async function initiateStkPush({ orderId, phone }) {
  const order = db.getOrder(orderId);
  if (!order) throw db.httpError(404, "Order not found");

  const credentials = db.getMpesaCredentialsDecrypted(order.businessId);

  if (!credentials) {
    // No business-owned M-Pesa connection yet — keep the order flow
    // unblocked with the original simulated experience rather than
    // forcing payments setup before a business can test anything.
    const updated = db.updateOrderStatus(orderId, "paid");
    return {
      simulated: true,
      checkoutRequestId: `SIM-${order.id.slice(0, 8)}`,
      order: updated,
      note: "This business hasn't connected their own M-Pesa paybill yet (Settings tab) — this is a simulated payment for demo purposes.",
    };
  }

  if (!phone) throw db.httpError(400, "Customer phone number is required to send a real M-Pesa STK push");

  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${credentials.shortcode}${credentials.passkey}${timestamp}`).toString("base64");
  const accessToken = await getAccessToken(credentials.consumerKey, credentials.consumerSecret);
  const msisdn = normalizeMsisdn(phone);
  const callbackBase = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

  const res = await fetch(`${DARAJA_BASE}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: credentials.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.max(1, Math.round(order.totalAmount)),
      PartyA: msisdn,
      PartyB: credentials.shortcode,
      PhoneNumber: msisdn,
      CallBackURL: `${callbackBase}/webhook/mpesa`,
      AccountReference: order.id.slice(0, 12),
      TransactionDesc: `Order ${order.id.slice(0, 8)}`,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ResponseCode !== "0") {
    throw db.httpError(502, data.errorMessage || data.ResponseDescription || "Safaricom rejected the STK push request.");
  }

  // Correlate Safaricom's async callback back to this order — the
  // callback only carries CheckoutRequestID, not our order id. The order
  // stays "pending" until /webhook/mpesa confirms success; do NOT mark it
  // paid here — a sent STK push is just a prompt on the customer's phone,
  // not a completed payment.
  db.attachMpesaCheckoutRequest(order.id, data.CheckoutRequestID);

  return {
    simulated: false,
    checkoutRequestId: data.CheckoutRequestID,
    order,
    note: "STK push sent to the customer's phone — the order will be marked paid automatically once Safaricom confirms payment.",
  };
}

// Handles Safaricom's asynchronous STK push result callback (POSTed to
// /webhook/mpesa — see server.js). Safaricom's payload shape:
// { Body: { stkCallback: { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata? } } }
function handleStkCallback(payload) {
  const stkCallback = payload && payload.Body && payload.Body.stkCallback;
  if (!stkCallback || !stkCallback.CheckoutRequestID) {
    console.warn("M-Pesa callback missing stkCallback/CheckoutRequestID — ignoring.");
    return;
  }

  const order = db.getOrderByCheckoutRequestId(stkCallback.CheckoutRequestID);
  if (!order) {
    console.warn(`M-Pesa callback for unknown CheckoutRequestID: ${stkCallback.CheckoutRequestID}`);
    return;
  }

  if (Number(stkCallback.ResultCode) === 0) {
    db.updateOrderStatus(order.id, "paid");
  } else {
    // Customer cancelled, entered the wrong PIN, insufficient funds, etc.
    // Leave the order as-is (not "cancelled") so the business can see it
    // and ask the customer to retry, rather than silently losing it.
    console.log(`M-Pesa payment not completed for order ${order.id}: ${stkCallback.ResultDesc || "unknown reason"}`);
  }
}

// Subscription billing (Pesa AI's own revenue from client businesses) —
// unchanged: this is Adplay collecting its own money, not intermediating
// anyone else's, so it stays the simpler "simulate now, wire up Daraja
// later with Adplay's own single MPESA_* app" stub.
async function initiateSubscriptionStkPush({ businessId, phone }) {
  const configured = process.env.MPESA_CONSUMER_KEY && process.env.MPESA_SHORTCODE;
  const subscription = db.chargeSubscription(businessId, {
    method: "mpesa-simulated",
    note: phone ? `STK push simulated to ${phone}` : "Simulated charge (no phone given)",
  });
  return {
    simulated: !configured,
    checkoutRequestId: `SUB-SIM-${businessId.slice(0, 8)}`,
    subscription,
    note: configured
      ? "Daraja credentials found, but this stub still simulates payment — implement the real STK push call here the same way order payments now work."
      : "No MPESA_* env vars set for Adplay's own billing — this is a simulated subscription payment for demo purposes.",
  };
}

module.exports = { initiateStkPush, handleStkCallback, initiateSubscriptionStkPush };
