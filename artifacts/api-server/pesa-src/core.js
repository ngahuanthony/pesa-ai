// The one function both WhatsApp (real customers) and the dashboard's
// Chat Tester (you, testing) go through. Keeping this shared is what
// guarantees "works in the simulator" == "works on real WhatsApp."

const db = require("./db");
const { getAssistantReply, getProductImageReplies } = require("./ai");

// The pre-filled text baked into the shop QR / wa.me link.
// When a customer taps the link, WhatsApp sends exactly this message.
// We detect it to trigger an instant, catalog-aware shop greeting.
const SHOP_LINK_TRIGGER = "hi, i'd like to shop";

// Keywords that signal a customer wants to speak to a human.
// Covers English, Kiswahili, and common Sheng phrasing.
const HANDOVER_TRIGGERS = [
  "talk to a human", "speak to a human", "talk to a person", "real person",
  "speak to someone", "connect me to", "talk to the owner", "speak to the owner",
  "talk to manager", "speak to manager", "need a human", "want a human",
  "human agent", "human support", "talk to agent",
  // Kiswahili / Sheng
  "mtu wa kweli", "msimamizi", "binadamu", "niongee na mtu",
  "nahitaji mtu", "talk to owner", "speak to owner",
];


function orderActions(replyText, order) {
  if (!order || order.error || !order.id) return { replyText, interactiveButtons: null };
  const total = Number(order.totalAmount || 0).toLocaleString("en-KE");
  return { replyText: (replyText || "Order received!") + "\n\nTotal: KSh " + total + "\nChoose an option below:", interactiveButtons: [
    { id: "mpesa_pay:" + order.id, title: "Lipa na M-Pesa" },
    { id: "deni_request:" + order.id, title: "Deni / Lipa Baadaye" },
    { id: "receipt:" + order.id, title: "Naomba Receipt" },
  ] };
}

function isHandoverRequest(text) {
  const lower = (text || "").toLowerCase();
  return HANDOVER_TRIGGERS.some((t) => lower.includes(t));
}

async function handleCustomerMessage({ business, customerPhone, customerName, text, channel, serviceLocationToken = null, serviceLocationId = null }) {
  let resolvedLocationId = serviceLocationId;
  let locationChanged = false;
  let locationContext = null;
  if (serviceLocationToken) {
    const resolved = db.resolveServiceLocation(serviceLocationToken);
    if (!resolved || resolved.business.id !== business.id) {
      return { replyText: "This service location is no longer available.", order: null };
    }
    resolvedLocationId = resolved.location.id;
    locationContext = resolved.location;
  } else if (resolvedLocationId) {
    locationContext = db.getServiceLocationForBusiness(business.id, resolvedLocationId);
  }
  const { customer, conversation } = db.mutate((state) => {
    const customer      = db.findOrCreateCustomer(state, business.id, customerPhone, customerName);
    const existing = state.conversations.find((item) => item.businessId === business.id && item.customerId === customer.id);
    if (!resolvedLocationId && existing && existing.serviceLocationId) resolvedLocationId = existing.serviceLocationId;
    locationChanged = Boolean(existing && resolvedLocationId && existing.serviceLocationId && existing.serviceLocationId !== resolvedLocationId);
    const conversation  = db.findOrCreateConversation(state, business.id, customer.id, channel, resolvedLocationId);
    db.addMessage(state, conversation.id, "customer", text);
    return { customer, conversation };
  });
  if (!locationContext && resolvedLocationId) {
    locationContext = db.getServiceLocationForBusiness(business.id, resolvedLocationId);
  }

  // ── Human handover: AI is paused for this conversation ───────────────────
  // Vendor has taken over. Don't auto-reply — return null so the caller
  // (whatsapp.js) skips sending a message.
  if (conversation.humanHandover) {
    return { replyText: null, order: null, customer, conversation };
  }

  // ── Handover request: customer wants to speak to a human ─────────────────
  if (isHandoverRequest(text)) {
    const replyText =
      `👋 Sure! I've let *${business.name}* know you'd like to speak with them directly.\n\n` +
      `They'll get back to you as soon as possible. Feel free to keep browsing in the meantime!`;
    db.mutate((state) => {
      const convo = state.conversations.find((c) => c.id === conversation.id);
      if (convo) { convo.humanHandover = true; convo.handoverAt = new Date().toISOString(); }
      db.addMessage(state, conversation.id, "assistant", replyText);
    });
    return { replyText, order: null, customer, conversation: { ...conversation, humanHandover: true } };
  }

  const { messages: history } = db.getConversationHistory(business.id, customerPhone, 20);
  // history includes the message we just added — drop it, the assistant gets it as userText
  const priorHistory = history.slice(0, -1);

  // First-ever message from this customer
  const isFirstMessage = priorHistory.length === 0;
  const isShopLinkEntry = text.trim().toLowerCase() === SHOP_LINK_TRIGGER;

   if (isFirstMessage || locationChanged) {
    if (isShopLinkEntry) {
      // Customer tapped the QR / shop link.
      // 1. Send the welcome message instantly (if one is configured).
      // 2. Then run the AI to fetch and present the live catalog as a second message.
      // Both land in sequence — greeting first, products right behind it.
       const locationGreeting = locationContext
         ? `Welcome to ${business.name}. You are at ${locationContext.label}. I can help you explore our services and place an order.`
         : business.welcomeMessage;
       const welcomeReply = locationGreeting || null;
      if (welcomeReply) {
        db.mutate((state) => {
          db.addMessage(state, conversation.id, "assistant", welcomeReply);
        });
      }

       const { replyText: catalogReply, order } = await getAssistantReply(business, customer.id, [], text, { shopEntry: true, serviceLocationId: resolvedLocationId });
      const prepared = orderActions(catalogReply, order);
      db.mutate((state) => { db.addMessage(state, conversation.id, "assistant", prepared.replyText); });

      // Return both so the WhatsApp sender can send them in order.
      return {
        replyText:    welcomeReply,   // sent first (null = skip)
        extraReplies: [catalogReply], // sent immediately after
        order,
        customer,
        conversation,
      };
    }

    // Normal first message → send static welcome so the vendor's custom greeting
    // always lands first, then AI takes over from message 2.
    if (business.welcomeMessage) {
      db.mutate((state) => {
        db.addMessage(state, conversation.id, "assistant", business.welcomeMessage);
      });
      return { replyText: business.welcomeMessage, mediaReplies: getProductImageReplies(business, text), order: null, customer, conversation };
    }
  }

  const { replyText, mediaReplies, order } = await getAssistantReply(business, customer.id, priorHistory, text, { serviceLocationId: resolvedLocationId });
  const prepared = orderActions(replyText, order);
  db.mutate((state) => { db.addMessage(state, conversation.id, "assistant", prepared.replyText); });
  return { replyText: prepared.replyText, mediaReplies, interactiveButtons: prepared.interactiveButtons, order, customer, conversation };
}

module.exports = { handleCustomerMessage };
