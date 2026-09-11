// WhatsApp Cloud API (Meta's official Business Platform API) integration.
//
// Fixed for true multi-tenancy:
//   • Webhook verification checks per-business verify tokens (stored in DB)
//     rather than one global WHATSAPP_VERIFY_TOKEN env var, so each business
//     can have its own webhook endpoint verified independently.
//   • Replies use the per-business encrypted access token stored in the DB
//     by the admin panel, NOT a global WHATSAPP_TOKEN env var.
//   • Webhook signature validation enforces X-Hub-Signature-256 when
//     WHATSAPP_APP_SECRET is set (strongly recommended in production).

const db = require("./db");
const fieldCrypto = require("./crypto");
const { handleCustomerMessage } = require("./core");
const mpesa = require("./mpesa");

const GRAPH_API_VERSION = "v21.0";

// GET /webhook/whatsapp — Meta calls this once per business when you click
// "Verify and save" in the App Dashboard.  We check the incoming verify_token
// against every business's stored whatsappVerifyToken so each business can
// be set up independently.  Falls back to the global WHATSAPP_VERIFY_TOKEN
// env var for backward compatibility or initial platform-level setup.
function verifyWebhook(query) {
  const mode      = query["hub.mode"];
  const token     = query["hub.verify_token"];
  const challenge = query["hub.challenge"];

  if (mode !== "subscribe" || !token || !challenge) {
    return { ok: false };
  }

  // Check per-business tokens first
  try {
    const state = db.loadRaw(); // see export added to db.js
    const matched = (state.businesses || []).some(
      (b) => b.whatsappVerifyToken && b.whatsappVerifyToken === token
    );
    if (matched) return { ok: true, challenge };
  } catch (err) {
    console.warn("[whatsapp] Could not check per-business verify tokens:", err.message);
  }

  // Fallback: global env var (for platform-level / initial setup)
  const globalToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (globalToken && token === globalToken) {
    return { ok: true, challenge };
  }

  return { ok: false };
}

// POST /webhook/whatsapp — called for every inbound message.
// Note: raw-body signature validation happens BEFORE this function is called,
// in server.js (which has access to the raw Buffer before JSON parsing).

async function sendButtonsMessage(phoneNumberId, to, body, buttons, accessToken) {
  if (!accessToken || !buttons || !buttons.length) return;
  const res = await fetch("https://graph.facebook.com/" + GRAPH_API_VERSION + "/" + phoneNumberId + "/messages", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + accessToken }, body: JSON.stringify({ messaging_product: "whatsapp", to, type: "interactive", interactive: { type: "button", body: { text: body }, action: { buttons: buttons.slice(0, 3).map((button) => ({ type: "reply", reply: { id: button.id, title: button.title } })) } } }) });
  if (!res.ok) console.error("[whatsapp] Interactive message failed (" + res.status + "): " + await res.text().catch(() => ""));
}

function normalizeIncomingPhone(phone) { return String(phone || "").replace(/\D/g, ""); }

async function handleButtonAction({ business, phoneNumberId, from, buttonId, accessToken }) {
  const [action, orderId] = String(buttonId || "").split(":");
  const order = db.getOrder(orderId);
  if (!order || order.businessId !== business.id) { await sendMessage(phoneNumberId, from, "This order is no longer available.", accessToken); return; }
  if (action === "mpesa_pay") {
    try {
      const result = await mpesa.initiateStkPush({ orderId, phone: from });
      await sendMessage(phoneNumberId, from, result.simulated ? "Sandbox mode: no money was charged. The payment request is only being simulated." : "M-Pesa prompt sent to your phone. Enter your PIN there; we’ll confirm the order after Safaricom verifies the payment.", accessToken);
    } catch (error) { await sendMessage(phoneNumberId, from, error.message || "M-Pesa payment could not be started.", accessToken); }
    return;
  }
  if (action === "deni_request") {
    const customer = db.listOrders(business.id).find((item) => item.id === order.id);
    const entry = db.createDeniRequest({ businessId: business.id, customerPhone: from, customerName: customer && customer.customerName, amount: order.totalAmount, product: (order.items || []).map((item) => item.productName + " x" + item.quantity).join(", "), orderId: order.id });
    if (business.personalPhone && business.whatsappPhoneNumberId) await sendMessage(phoneNumberId, business.personalPhone, "Sale " + Number(entry.amount).toLocaleString("en-KE") + " KSh — " + (entry.product || "order") + " for " + (entry.customerName || entry.customerPhone) + ". Reply DENI to approve or IGNORE.", accessToken);
    await sendMessage(phoneNumberId, from, "Nimeuliza mwenye shop kuhusu deni lako. Tutakujibu likikubaliwa.", accessToken);
    return;
  }
  if (action === "receipt") {
    const method = order.paymentMeta && order.paymentMeta.paymentMethod;
    const ref = order.paymentMeta && order.paymentMeta.mpesaTxnId;
    await sendMessage(phoneNumberId, from, "Receipt\nOrder: " + order.id.slice(0, 8) + "\nTotal: KSh " + Number(order.totalAmount).toLocaleString("en-KE") + "\nStatus: " + order.status + (method ? "\nPayment: " + method : "") + (ref ? "\nRef: " + ref : ""), accessToken);
  }
}

async function handleIncomingWebhook(body) {
  const entry  = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value  = change?.value;
  if (!value) return; // status updates, delivery receipts — nothing to do

  const phoneNumberId = value.metadata?.phone_number_id;
  const message       = value.messages?.[0];
  if (!phoneNumberId || !message) return;

  const business = db.getBusinessByWhatsappPhoneNumberId(phoneNumberId);
  if (!business) {
    console.warn(`[whatsapp] No business matched phone_number_id=${phoneNumberId}`);
    return;
  }

  const from        = message.from; // customer's phone number (MSISDN)
  const buttonId = message.interactive?.button_reply?.id || null;
  const text        = message.text?.body || message.interactive?.button_reply?.title || message.button?.text || null;
  if (!text && !buttonId) {
    if (message.type === "audio") console.warn("[whatsapp] Audio message received but no transcription adapter is configured");
    return;
  }

  const contactName = value.contacts?.[0]?.profile?.name;
  const accessToken = resolveAccessToken(business);

  if (buttonId) { await handleButtonAction({ business, phoneNumberId, from, buttonId, accessToken }); return; }
  if (business.personalPhone && normalizeIncomingPhone(from) === normalizeIncomingPhone(business.personalPhone) && String(text).trim().toLowerCase() === "deni") {
    const approved = db.approveLatestDeniRequest(business.id);
    if (approved) { await sendMessage(phoneNumberId, from, "Deni imehifadhiwa: KSh " + Number(approved.amount).toLocaleString("en-KE") + ".", accessToken); await sendMessage(phoneNumberId, approved.customerPhone, "Deni imekubaliwa na shop. Kiasi: KSh " + Number(approved.amount).toLocaleString("en-KE") + ". Tutaendelea na order yako.", accessToken); }
    else await sendMessage(phoneNumberId, from, "Hakuna ombi la deni linalosubiri.", accessToken);
    return;
  }

  const { replyText, extraReplies, interactiveButtons } = await handleCustomerMessage({
    business,
    customerPhone: from,
    customerName:  contactName,
    text,
    channel: "whatsapp",
  });

  // Resolve the access token for THIS business (per-business, decrypted)

  // replyText is null when AI is paused (human handover active) — skip sending
  if (replyText) await sendMessage(phoneNumberId, from, replyText, accessToken);

  // Shop-link entry: send the catalog message immediately after the welcome
  if (extraReplies && extraReplies.length) { for (const extra of extraReplies) if (extra) await sendMessage(phoneNumberId, from, extra, accessToken); }
  if (interactiveButtons) await sendButtonsMessage(phoneNumberId, from, "Choose a payment option:", interactiveButtons, accessToken);
}

// Decrypt and return the per-business WhatsApp access token.
// Falls back to the global WHATSAPP_TOKEN env var if none is stored
// (e.g. during dev/testing before admin has configured the business).
function resolveAccessToken(business) {
  if (business.whatsappAccessTokenEnc) {
    try {
      return fieldCrypto.decrypt(business.whatsappAccessTokenEnc);
    } catch (err) {
      console.error(`[whatsapp] Could not decrypt access token for business ${business.id}:`, err.message);
    }
  }
  // Fallback to global token (for dev/single-tenant setups)
  const globalToken = process.env.WHATSAPP_TOKEN;
  if (globalToken) {
    console.warn(`[whatsapp] Using global WHATSAPP_TOKEN for business ${business.id} — set per-business token in admin panel for production.`);
    return globalToken;
  }
  return null;
}

async function sendMessage(phoneNumberId, to, text, accessToken) {
  if (!accessToken) {
    console.warn("[whatsapp] No access token available — skipping send. Reply was:", text);
    return false;
  }
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "content-type":  "application/json",
        authorization:   `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[whatsapp] Send failed (${res.status}): ${errText}`);
    return false;
  }
  return true;
}

async function sendPlatformOtp(to, code, context = {}) {
  const accessToken = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_SENDER_ID;
  if (!accessToken || !phoneNumberId) throw new Error("WhatsApp OTP sender is not configured");
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME || "pesa_ai_otp";
  const languageCode = process.env.WHATSAPP_OTP_LANGUAGE || "en_US";
  const message = context.shopName ? "Pesa AI code is " + code + ". Enter it to create " + context.shopName + " shop." : "Pesa AI login code: " + code;
  const res = await fetch("https://graph.facebook.com/" + GRAPH_API_VERSION + "/" + phoneNumberId + "/messages", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + accessToken }, body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: templateName, language: { code: languageCode }, components: [{ type: "body", parameters: [{ type: "text", text: code }, { type: "text", text: context.shopName || "Pesa AI" }] }] } }) });
  if (!res.ok) { const errorText = await res.text().catch(() => ""); throw new Error("WhatsApp OTP send failed (" + res.status + "): " + errorText.slice(0, 300)); }
  return { message };
}

// Maps Pesa AI business categories to WhatsApp vertical codes
function getWhatsAppVertical(category) {
  if (!category) return "OTHER";
  const c = category.toLowerCase();
  if (c.includes("fashion") || c.includes("cloth") || c.includes("apparel")) return "CLOTHING_AND_APPAREL";
  if (c.includes("phone") || c.includes("mobile") || c.includes("electronic") || c.includes("gadget") || c.includes("computer")) return "SHOPPING_AND_RETAIL";
  if (c.includes("beauty") || c.includes("cosmet") || c.includes("spa") || c.includes("salon")) return "BEAUTY_SPA_AND_SALON";
  if (c.includes("food") || c.includes("beverag") || c.includes("grocery")) return "FOOD_AND_GROCERY";
  if (c.includes("restaurant")) return "RESTAURANT";
  if (c.includes("health") || c.includes("pharma") || c.includes("medical")) return "MEDICAL_AND_HEALTH";
  if (c.includes("hotel") || c.includes("lodg") || c.includes("accommodation")) return "HOTEL_AND_LODGING";
  if (c.includes("travel") || c.includes("transport") || c.includes("logistics")) return "TRAVEL_AND_TRANSPORTATION";
  if (c.includes("finance") || c.includes("bank") || c.includes("insurance")) return "FINANCE_AND_BANKING";
  if (c.includes("education") || c.includes("school") || c.includes("training")) return "EDUCATION";
  if (c.includes("home") || c.includes("furnitur") || c.includes("interior")) return "SHOPPING_AND_RETAIL";
  if (c.includes("agricult") || c.includes("produce") || c.includes("farm")) return "FOOD_AND_GROCERY";
  return "SHOPPING_AND_RETAIL";
}

// Push the business profile to Meta so customers see the business name,
// description, and category when they view the WhatsApp contact.
// Non-fatal: errors are logged but don't block the credential save.
async function updateWhatsAppBusinessProfile(business, phoneNumberId, accessToken) {
  if (!phoneNumberId || !accessToken) return;

  const vertical = getWhatsAppVertical(business.category);
  const locationParts = [business.location, business.buildingName, business.shopNumber].filter(Boolean);
  const address = locationParts.join(", ") || undefined;

  const profileData = {
    about: "AI-powered WhatsApp shop — browse, order & pay instantly 🛍️",
    description: `${business.name} — ${business.category || "Shop"} in Kenya. Chat with us to browse products, place orders & pay via M-Pesa.`,
    vertical,
    ...(address ? { address } : {}),
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/whatsapp_business_profile`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ messaging_product: "whatsapp", ...profileData }),
      }
    );
    if (res.ok) {
      console.log(`[whatsapp] Business profile updated for ${business.name} (${phoneNumberId})`);
    } else {
      const err = await res.text().catch(() => "");
      console.warn(`[whatsapp] Profile update failed (${res.status}): ${err.slice(0, 200)}`);
    }
  } catch (err) {
    console.warn(`[whatsapp] Profile update error: ${err.message}`);
  }
}

async function updateWhatsAppProfilePicture(phoneNumberId, accessToken, imageDataUrl) {
  if (!phoneNumberId || !accessToken || !imageDataUrl) return false;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl);
  if (!match) throw new Error("Profile picture must be a PNG data URL");
  const image = Buffer.from(match[1], "base64");
  if (image.length < 100 || image.length > 1_000_000) {
    throw new Error("Profile picture size is invalid");
  }
  const appId = process.env.WHATSAPP_APP_ID || "3095173927353545";

  const sessionRes = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${appId}/uploads?file_length=${image.length}&file_type=image/png`,
    { method: "POST", headers: { authorization: `Bearer ${accessToken}` } }
  );
  if (!sessionRes.ok) throw new Error(`Meta upload session failed (${sessionRes.status})`);
  const session = await sessionRes.json();

  const uploadRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${session.id}`, {
    method: "POST",
    headers: {
      authorization: `OAuth ${accessToken}`,
      file_offset: "0",
      "content-type": "application/octet-stream",
    },
    body: image,
  });
  if (!uploadRes.ok) throw new Error(`Meta image upload failed (${uploadRes.status})`);
  const uploaded = await uploadRes.json();
  if (!uploaded.h) throw new Error("Meta did not return an image handle");

  const profileRes = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/whatsapp_business_profile`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        profile_picture_handle: uploaded.h,
      }),
    }
  );
  if (!profileRes.ok) throw new Error(`Meta profile picture update failed (${profileRes.status})`);
  return true;
}

async function subscribeWaba(wabaId, accessToken) {
  if (!wabaId || !accessToken) return false;
  const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`WABA subscription failed (${response.status}): ${errorText.slice(0, 300)}`);
  }
  return true;
}

module.exports = {
  verifyWebhook,
  handleIncomingWebhook,
  sendMessage,
  sendPlatformOtp,
  resolveAccessToken,
  updateWhatsAppBusinessProfile,
  updateWhatsAppProfilePicture,
  subscribeWaba,
};
