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
const { buildWhatsAppListPayload, getConciergePrompt } = require("./concierge");
const mpesa = require("./mpesa");
const { buildPublicPaymentInstructions } = require("./payment-instructions");

const GRAPH_API_VERSION = "v21.0";
const WHATSAPP_TEXT_LIMIT = 4000;

function splitWhatsAppText(text) {
  let remaining = String(text ?? "");
  const chunks = [];

  while (remaining.length > WHATSAPP_TEXT_LIMIT) {
    const newlineIndex = remaining.lastIndexOf("\n", WHATSAPP_TEXT_LIMIT - 1);
    let splitIndex = newlineIndex >= WHATSAPP_TEXT_LIMIT / 2
      ? newlineIndex + 1
      : WHATSAPP_TEXT_LIMIT;

    // Do not split a UTF-16 surrogate pair when a single line is too long.
    const previousCodeUnit = remaining.charCodeAt(splitIndex - 1);
    const nextCodeUnit = remaining.charCodeAt(splitIndex);
    if (
      previousCodeUnit >= 0xD800 &&
      previousCodeUnit <= 0xDBFF &&
      nextCodeUnit >= 0xDC00 &&
      nextCodeUnit <= 0xDFFF
    ) {
      splitIndex -= 1;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex);
  }

  if (remaining.length || !chunks.length) chunks.push(remaining);
  return chunks;
}

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
  if (!accessToken || !buttons || !buttons.length) return false;
  const res = await fetch("https://graph.facebook.com/" + GRAPH_API_VERSION + "/" + phoneNumberId + "/messages", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + accessToken }, body: JSON.stringify({ messaging_product: "whatsapp", to, type: "interactive", interactive: { type: "button", body: { text: body }, action: { buttons: buttons.slice(0, 3).map((button) => ({ type: "reply", reply: { id: button.id, title: button.title } })) } } }) });
  if (!res.ok) {
    console.error("[whatsapp] Interactive message failed (" + res.status + "): " + await res.text().catch(() => ""));
    return false;
  }
  return true;
}

async function sendListMessage(phoneNumberId, to, list, accessToken) {
  if (!accessToken || !list || !Array.isArray(list.rows) || !list.rows.length) return;
  const res = await fetch(
    "https://graph.facebook.com/" + GRAPH_API_VERSION + "/" + phoneNumberId + "/messages",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + accessToken,
      },
      body: JSON.stringify(buildWhatsAppListPayload(to, list)),
    }
  );
  if (!res.ok) console.error("[whatsapp] Interactive list message failed (" + res.status + "): " + await res.text().catch(() => ""));
}

function normalizeIncomingPhone(phone) { return String(phone || "").replace(/\D/g, ""); }

function parseReservationStaffCommand(text) {
  const value = String(text || "").trim();
  const confirm = value.match(/^CONFIRM\s+(RR-[A-Z0-9-]+)\s+(?:(?:KSH|KES)\s*)?([\d,]+(?:\.\d{1,2})?)(?:\s+NOTE:\s*([\s\S]{1,1000}))?$/i);
  if (confirm) {
    const amount = Number(confirm[2].replace(/,/g, ""));
    return Number.isFinite(amount) && amount >= 0
      ? { action: "CONFIRM", reference: confirm[1].toUpperCase(), quotedAmount: amount, staffNotes: confirm[3]?.trim() || null }
      : { action: "INVALID", message: "Enter a valid non-negative room rate." };
  }
  const decline = value.match(/^DECLINE\s+(RR-[A-Z0-9-]+)(?:\s+NOTE:\s*([\s\S]{1,1000}))?$/i);
  if (decline) {
    return { action: "DECLINE", reference: decline[1].toUpperCase(), staffNotes: decline[2]?.trim() || null };
  }
  if (/^(?:CONFIRM|DECLINE)\b/i.test(value)) {
    return {
      action: "INVALID",
      message: "Use CONFIRM <reference> <rate in KSh> or DECLINE <reference>. Optional notes: NOTE: ...",
    };
  }
  return null;
}

function buildReservationRequestNotice(reservation) {
  return [
    `New room request ${reservation.reference}`,
    `Guest: ${reservation.customerName || "Guest"} (${reservation.customerPhone})`,
    `Room: ${reservation.roomType}`,
    `Dates: ${reservation.checkInDate} to ${reservation.checkOutDate}`,
    `Guests: ${reservation.guestCount}`,
    reservation.specialRequests ? `Special requests: ${reservation.specialRequests}` : null,
    "",
    `Check availability and rate, then reply: CONFIRM ${reservation.reference} <rate in KSh>`,
    `Or reply: DECLINE ${reservation.reference}`,
  ].filter((line) => line !== null).join("\n");
}

async function notifyReservationDecision(business, reservation) {
  const accessToken = resolveAccessToken(business);
  if (!business?.whatsappPhoneNumberId || !accessToken || !db.isCustomerMessagingActive(business)) return false;
  let message;
  if (reservation.status === "CONFIRMED") {
    const paymentInstructions = buildPublicPaymentInstructions(business, reservation.customerPhone);
    message = [
      `Your room request ${reservation.reference} is confirmed.`,
      `Room: ${reservation.roomType}`,
      `Dates: ${reservation.checkInDate} to ${reservation.checkOutDate}`,
      `Guests: ${reservation.guestCount}`,
      `Rate: KSh ${Number(reservation.quotedAmount).toLocaleString("en-KE")}`,
      paymentInstructions
        ? "Please use these saved receiving details. This message does not charge you."
        : "Please contact reception for payment instructions.",
    ].join("\n") + paymentInstructions;
  } else if (reservation.status === "DECLINED") {
    message = `We’re unable to confirm your room request ${reservation.reference} for ${reservation.checkInDate} to ${reservation.checkOutDate}. Please contact reception to discuss other options.`;
  } else {
    return false;
  }
  return sendMessage(business.whatsappPhoneNumberId, reservation.customerPhone, message, accessToken);
}

async function handleReservationStaffReply({ business, phoneNumberId, from, text, accessToken }) {
  if (!business.personalPhone || normalizeIncomingPhone(from) !== normalizeIncomingPhone(business.personalPhone)) {
    return false;
  }
  const command = parseReservationStaffCommand(text);
  if (!command) return false;
  if (command.action === "INVALID") {
    await sendMessage(phoneNumberId, from, command.message, accessToken);
    return true;
  }
  const reservation = db.getRoomReservation(business.id, command.reference);
  if (!reservation) {
    await sendMessage(phoneNumberId, from, `No room request found for ${command.reference}.`, accessToken);
    return true;
  }
  if (reservation.status !== "PENDING") {
    await sendMessage(phoneNumberId, from, `${reservation.reference} has already been ${reservation.status.toLowerCase()}.`, accessToken);
    return true;
  }
  try {
    const patch = command.action === "CONFIRM"
      ? { status: "CONFIRMED", quotedAmount: command.quotedAmount, ...(command.staffNotes ? { staffNotes: command.staffNotes } : {}) }
      : { status: "DECLINED", ...(command.staffNotes ? { staffNotes: command.staffNotes } : {}) };
    const updated = db.updateRoomReservation(business.id, reservation.id, patch);
    if (updated.status === "CONFIRMED") {
      await notifyReservationDecision(business, updated);
      await sendMessage(phoneNumberId, from, `${updated.reference} confirmed at KSh ${Number(updated.quotedAmount).toLocaleString("en-KE")}.`, accessToken);
    } else {
      await notifyReservationDecision(business, updated);
      await sendMessage(phoneNumberId, from, `${updated.reference} declined.`, accessToken);
    }
  } catch (error) {
    await sendMessage(phoneNumberId, from, error.message || "The reservation request could not be updated.", accessToken);
  }
  return true;
}

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
    await sendMessage(phoneNumberId, from, "Deni requests are no longer available from this button. Please message the business team to discuss payment.", accessToken);
    return;
  }
  if (action === "receipt") {
    const method = order.paymentMeta && order.paymentMeta.paymentMethod;
    const ref = order.paymentMeta && order.paymentMeta.mpesaTxnId;
    await sendMessage(phoneNumberId, from, "Receipt\nOrder: " + order.id.slice(0, 8) + "\nTotal: KSh " + Number(order.totalAmount).toLocaleString("en-KE") + "\nStatus: " + order.status + (method ? "\nPayment: " + method : "") + (ref ? "\nRef: " + ref : ""), accessToken);
  }
}

async function processDuePaymentReminders({ orderId = null, limit = 20 } = {}) {
  const reminders = db.claimDuePaymentReminders({ orderId, limit });
  const results = [];

  for (const reminder of reminders) {
    try {
      const order = db.getOrder(reminder.orderId);
      if (!order) {
        db.skipPaymentReminder(reminder.id, "order no longer exists");
        results.push({ reminderId: reminder.id, status: "skipped" });
        continue;
      }
      const paymentStatus = String(order.paymentStatus || "").toUpperCase();
      const fulfillmentStatus = String(order.fulfillmentStatus || "").toUpperCase();
      const orderStatus = String(order.status || "").toLowerCase();
      if (paymentStatus === "PAID" || orderStatus === "paid") {
        db.skipPaymentReminder(reminder.id, "order is paid");
        results.push({ reminderId: reminder.id, status: "skipped" });
        continue;
      }
      if (fulfillmentStatus === "CANCELLED" || orderStatus === "cancelled") {
        db.skipPaymentReminder(reminder.id, "order is cancelled");
        results.push({ reminderId: reminder.id, status: "skipped" });
        continue;
      }

      const business = db.getBusiness(reminder.businessId);
      const phoneNumberId = business.whatsappPhoneNumberId;
      const accessToken = resolveAccessToken(business);
      if (!phoneNumberId || !accessToken) {
        throw new Error("WhatsApp delivery is not configured for this business");
      }

      const reference = String(order.id).slice(0, 8).toUpperCase();
      const paymentInstructions = buildPublicPaymentInstructions(business, reminder.customerPhone).trim();
      const text = [
        `A quick reminder about your order #${reference}.`,
        `Current total: KSh ${Number(order.totalAmount || 0).toLocaleString("en-KE")}.`,
        paymentInstructions || "Please reply here and the team will help with payment.",
        "If you've already paid, please ignore this message.",
      ].join("\n\n");
      const buttons = [{ id: "receipt:" + order.id, title: "Naomba Receipt" }];
      const canSendStkPush = business.mpesa?.enabled === true && business.mpesa?.verified === true;
      if (canSendStkPush) buttons.unshift({ id: "mpesa_pay:" + order.id, title: "Lipa na M-Pesa" });

      const sent = await sendButtonsMessage(phoneNumberId, reminder.customerPhone, text, buttons, accessToken);
      if (!sent) throw new Error("WhatsApp reminder delivery failed");
      db.markPaymentReminderSent(reminder.id);
      results.push({ reminderId: reminder.id, status: "sent" });
    } catch (error) {
      db.retryPaymentReminder(reminder.id, error.message);
      console.error("[whatsapp] Payment reminder failed for order " + reminder.orderId + ": " + error.message);
      results.push({ reminderId: reminder.id, status: "retrying" });
    }
  }

  return results;
}

function startPaymentReminderScheduler() {
  if (process.env.PAYMENT_REMINDER_CRON_ENABLED === "false") return null;
  const timer = setInterval(() => {
    processDuePaymentReminders().catch((error) => {
      console.error("[whatsapp] Payment reminder scheduler failed: " + error.message);
    });
  }, 15_000);
  timer.unref?.();
  return timer;
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
  if (!db.isCustomerMessagingActive(business)) {
    console.warn(`[whatsapp] Customer message ignored while owner/Meta activation checks are incomplete for business=${business.id}`);
    return;
  }

  const from        = message.from; // customer's phone number (MSISDN)
  const buttonId = message.interactive?.button_reply?.id || null;
  const listReplyId = message.interactive?.list_reply?.id || null;
  let text = message.text?.body || message.interactive?.list_reply?.title || message.interactive?.button_reply?.title || message.button?.text || null;
  if (!text && !buttonId && !listReplyId) {
    if (message.type === "audio") console.warn("[whatsapp] Audio message received but no transcription adapter is configured");
    return;
  }
  const conciergePrompt = listReplyId ? getConciergePrompt(listReplyId) : null;
  if (conciergePrompt) text = conciergePrompt;

  const contactName = value.contacts?.[0]?.profile?.name;
  const accessToken = resolveAccessToken(business);
  const normalizedText = String(text || "").trim().toLowerCase();
  const locationMatch = String(text || "").match(/(?:location|service_location|service-location)=([A-Za-z0-9_-]{20,})/i);
  const serviceLocationToken = locationMatch ? locationMatch[1] : null;

  if (await handleReservationStaffReply({ business, phoneNumberId, from, text, accessToken })) return;

  // Public shop links use a short, deterministic greeting. Keep the first
  // response lightweight, then answer later product requests with only the
  // matching photographed variant rather than sending the whole catalogue.
  const publicShopSlug = db.getPublicShopSlug(business);
  if (normalizedText === `hi ${String(publicShopSlug).toLowerCase()}`) {
    await sendMessage(phoneNumberId, from, "Habari! " + business.name + " hapa. Unatafuta gani?", accessToken);
    return;
  }
  const requestedVariants = db.searchPublicProducts(business.id, text, { limit: 1 });
  if (requestedVariants.length) {
    const variant = requestedVariants[0];
    const caption = buildProductImageCaption(business, variant);
    await sendImageMessage(phoneNumberId, from, variant.imageUrl, caption, accessToken);
    return;
  }

  if (normalizedText === "login") {
    const account = db.getAccountByPersonalPhone(from);
    if (!account) {
      await sendMessage(phoneNumberId, from, "We could not start login for this number. Send LOGIN from the personal WhatsApp number registered to your Pesa SI shop.", accessToken);
      return;
    }
    try {
      const challenge = db.createOtpChallenge(from, "login", { source: "whatsapp_service_window" });
      const sent = await sendMessage(phoneNumberId, from, "Pesa SI login code: " + challenge.code + ". It expires in 5 minutes. Do not share this code.", accessToken);
      if (!sent) console.error("[whatsapp] Could not send service-window login OTP to " + db.maskPhone(from));
    } catch (error) {
      const status = error?.status || error?.statusCode;
      const reply = status === 429 ? "Too many login codes were requested. Please wait and try again later." : "We could not create a login code right now. Please try again shortly.";
      await sendMessage(phoneNumberId, from, reply, accessToken);
    }
    return;
  }

  if (buttonId) { await handleButtonAction({ business, phoneNumberId, from, buttonId, accessToken }); return; }
  if (business.personalPhone && normalizeIncomingPhone(from) === normalizeIncomingPhone(business.personalPhone) && String(text).trim().toLowerCase() === "deni") {
    const approved = db.approveLatestDeniRequest(business.id);
    if (approved) { await sendMessage(phoneNumberId, from, "Deni imehifadhiwa: KSh " + Number(approved.amount).toLocaleString("en-KE") + ".", accessToken); await sendMessage(phoneNumberId, approved.customerPhone, "Deni imekubaliwa na shop. Kiasi: KSh " + Number(approved.amount).toLocaleString("en-KE") + ". Tutaendelea na order yako.", accessToken); }
    else await sendMessage(phoneNumberId, from, "Hakuna ombi la deni linalosubiri.", accessToken);
    return;
  }

  const { replyText, welcomeText, assistantReplyText, extraReplies, interactiveButtons, interactiveList, mediaReplies, reservationRequest, order } = await handleCustomerMessage({
    business,
    customerPhone: from,
    customerName:  contactName,
    text,
    channel: "whatsapp",
    serviceLocationToken,
  });

  if (reservationRequest && business.personalPhone) {
    await sendMessage(phoneNumberId, business.personalPhone, buildReservationRequestNotice(reservationRequest), accessToken);
  }

  // Resolve the access token for THIS business (per-business, decrypted)

  // Table QR flow sends its welcome, concierge choices, and menu response in order.
  if (interactiveList) {
    if (welcomeText) await sendMessage(phoneNumberId, from, welcomeText, accessToken);
    await sendListMessage(phoneNumberId, from, interactiveList, accessToken);
    if (assistantReplyText) await sendMessage(phoneNumberId, from, assistantReplyText, accessToken);
  } else if (replyText) {
    // replyText is null when AI is paused (human handover active) — skip sending.
    await sendMessage(phoneNumberId, from, replyText, accessToken);
  }

  // Shop-link entry: send the catalog message immediately after the welcome
  if (extraReplies && extraReplies.length) { for (const extra of extraReplies) if (extra) await sendMessage(phoneNumberId, from, extra, accessToken); }
  if (mediaReplies && mediaReplies.length) {
    for (const media of mediaReplies) {
      await sendImageMessage(phoneNumberId, from, media.link, media.caption, accessToken);
    }
  }
  if (interactiveButtons) await sendButtonsMessage(phoneNumberId, from, "Choose a payment option:", interactiveButtons, accessToken);
  if (order?.id) await processDuePaymentReminders({ orderId: order.id });
}

function buildProductImageCaption(business, variant) {
  const label = variant.productName + (variant.variant ? " — " + variant.variant : "");
  const quantity = Number(variant.stockQty) || 0;
  const availability = db.isHospitalityBusiness(business)
    ? "Available by default"
    : quantity > 0 ? "Stock: " + quantity : "Out of stock";
  return label + "\n" + availability + "\nPrice: KSh " + Number(variant.price || 0).toLocaleString("en-KE");
}

// Decrypt and return the per-business WhatsApp access token.
// Falls back to the global WHATSAPP_TOKEN env var if none is stored
// (e.g. during dev/testing before admin has configured the business).
function resolveAccessToken(business) {
  const platformPhoneNumberId = String(process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || "1414909975031488");
  if (String(business.whatsappPhoneNumberId || "") === platformPhoneNumberId) {
    const platformToken = process.env.WHATSAPP_PLATFORM_TOKEN || process.env.WHATSAPP_TOKEN;
    if (platformToken) return platformToken;
  }
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
    console.warn("[whatsapp] No access token available — skipping send.");
    return false;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  for (const body of splitWhatsAppText(text)) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[whatsapp] Send failed (${res.status}): ${errText}`);
      return false;
    }
  }
  return true;
}

async function sendImageMessage(phoneNumberId, to, link, caption, accessToken) {
  if (!accessToken) {
    console.warn("[whatsapp] No access token available — skipping product image:", link);
    return false;
  }
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { link, ...(caption ? { caption } : {}) },
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[whatsapp] Image send failed (${res.status}): ${errText}`);
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
  const message = context.shopName ? "Pesa SI code is " + code + ". Enter it to create " + context.shopName + " shop." : "Pesa SI login code: " + code;
  const res = await fetch("https://graph.facebook.com/" + GRAPH_API_VERSION + "/" + phoneNumberId + "/messages", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + accessToken }, body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: templateName, language: { code: languageCode }, components: [{ type: "body", parameters: [{ type: "text", text: code }, { type: "text", text: context.shopName || "Pesa SI" }] }] } }) });
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
  GRAPH_API_VERSION,
  verifyWebhook,
  handleIncomingWebhook,
  sendMessage,
  sendImageMessage,
  sendPlatformOtp,
  buildProductImageCaption,
  parseReservationStaffCommand,
  buildReservationRequestNotice,
  buildPublicPaymentInstructions,
  notifyReservationDecision,
  resolveAccessToken,
  updateWhatsAppBusinessProfile,
  updateWhatsAppProfilePicture,
  subscribeWaba,
  processDuePaymentReminders,
  startPaymentReminderScheduler,
};
