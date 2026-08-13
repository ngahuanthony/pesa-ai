// WhatsApp Cloud API (Meta's official Business Platform API) integration.
//
// This is intentionally the ONLY file that needs to change once you
// connect a real WhatsApp Business number — everything else (AI
// assistant, orders, products) already works today through the in-app
// Chat Tester, which calls the exact same core.handleCustomerMessage()
// function this webhook calls.

const db = require("./db");
const { handleCustomerMessage } = require("./core");

const GRAPH_API_VERSION = "v21.0";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

// GET /webhook/whatsapp — Meta calls this once, when you click "Verify
// and save" in the App Dashboard, to prove you control this endpoint.
function verifyWebhook(query) {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

// POST /webhook/whatsapp — Meta calls this for every inbound message.
// Payload shape: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
async function handleIncomingWebhook(body) {
  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  if (!value) return; // status updates, etc. — nothing to do

  const phoneNumberId = value.metadata?.phone_number_id;
  const message = value.messages?.[0];
  if (!phoneNumberId || !message) return; // e.g. a delivery/read receipt, not a message

  const business = db.getBusinessByWhatsappPhoneNumberId(phoneNumberId);
  if (!business) {
    console.warn(`No business is connected to WhatsApp phone_number_id ${phoneNumberId}`);
    return;
  }

  const from = message.from; // customer's phone number
  const text = message.text?.body;
  if (!text) return; // images/audio/etc. — not handled yet

  const contactName = value.contacts?.[0]?.profile?.name;

  const { replyText } = await handleCustomerMessage({
    business,
    customerPhone: from,
    customerName: contactName,
    text,
    channel: "whatsapp",
  });

  await sendMessage(phoneNumberId, from, replyText);
}

async function sendMessage(phoneNumberId, to, text) {
  if (!WHATSAPP_TOKEN) {
    console.warn("WHATSAPP_TOKEN not set — skipping actual send. Reply was:", text);
    return;
  }
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`WhatsApp send failed (${res.status}): ${errText}`);
  }
}

module.exports = { verifyWebhook, handleIncomingWebhook, sendMessage };
