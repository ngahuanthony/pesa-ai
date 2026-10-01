// The one function both WhatsApp (real customers) and the dashboard's
// Chat Tester (you, testing) go through. Keeping this shared is what
// guarantees "works in the simulator" == "works on real WhatsApp."

const db = require("./db");
const { getAssistantReply, getProductImageReplies } = require("./ai");
const { buildConciergeList } = require("./concierge");

// The pre-filled text baked into the shop QR / wa.me link.
// When a customer taps the link, WhatsApp sends exactly this message.
// We detect it to trigger an instant, catalog-aware shop greeting.
const SHOP_LINK_TRIGGER = "hi, i'd like to shop";
const HOTEL_SHOP_LINK_TRIGGER = db.generateShopEntryPrompt("Skyview Opal Hotel").toLowerCase();

function isShopLinkTrigger(text, business) {
  const normalized = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  const businessPrompt = business ? db.generateShopEntryPrompt(business).toLowerCase() : null;
  return normalized === SHOP_LINK_TRIGGER ||
    normalized === HOTEL_SHOP_LINK_TRIGGER ||
    normalized === businessPrompt;
}

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

function extractTableNumber(text, previousAssistantText = "") {
  const message = String(text || "");
  const explicit = message.match(/\btable(?:\s+(?:number|no\.?))?[\s:#-]*(\d{1,3})\b/i);
  if (explicit) {
    const remainder = message.slice(explicit.index + explicit[0].length);
    if (/^\s*(?:to|through|[-–—])\s*\d/i.test(remainder)) return null;
    return Number(explicit[1]);
  }
  const numericReply = message.trim().match(/^(\d{1,3})$/);
  const assistantRequestedTable = /\btable numbers?\b|\bwhich table\b|\bwhat table\b|\b(?:tell|send|share|confirm).{0,40}\btable\b/i.test(previousAssistantText);
  if (numericReply && assistantRequestedTable) return Number(numericReply[1]);
  return null;
}

async function handleCustomerMessage({ business, customerPhone, customerName, text, channel, serviceLocationToken = null, serviceLocationId = null }) {
  let resolvedLocationId = serviceLocationId;
  let locationChanged = false;
  let locationContext = null;
  if (!serviceLocationToken && !resolvedLocationId) {
    const { messages: previousMessages = [] } = db.getConversationHistory(business.id, customerPhone, 20);
    const previousAssistantText = [...previousMessages].reverse().find((message) => message.role === "assistant")?.content || "";
    const tableNumber = extractTableNumber(text, previousAssistantText);
    if (tableNumber !== null) {
      if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 35) {
        return { replyText: "Our table numbers run from 1 to 35. Please check the number at your table and send it again.", order: null };
      }
      const tableLocation = db.listServiceLocations(business.id).find((location) =>
        location.active &&
        String(location.kind).toUpperCase() === "TABLE" &&
        String(location.label).trim().toLowerCase() === "table " + tableNumber
      );
      if (!tableLocation) {
        return { replyText: "I can't match Table " + tableNumber + " to an active table right now. Please check the number or ask a staff member for help.", order: null };
      }
      resolvedLocationId = tableLocation.id;
      locationContext = tableLocation;
    }
  }
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
    locationChanged = Boolean(existing && resolvedLocationId && existing.serviceLocationId !== resolvedLocationId);
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
  const isTableQrEntry = Boolean(
    serviceLocationToken &&
    locationContext &&
    String(locationContext.kind).toUpperCase() === "TABLE"
  );
  const isTableLocation = Boolean(
    locationContext &&
    String(locationContext.kind).toUpperCase() === "TABLE"
  );
  if (isTableLocation) {
    const { replyText: tableReply, mediaReplies, order } = await getAssistantReply(
      business,
      customer.id,
      priorHistory,
      text,
      { shopEntry: isTableQrEntry, serviceLocationId: resolvedLocationId }
    );
    const prepared = orderActions(tableReply, order);
    const configuredWelcome = String(business.welcomeMessage || "").trim();
    const welcome = configuredWelcome || ("Welcome to " + business.name + "! I can help with dining, rooms, the pool, conferences, and events.");
    const locationGreeting = locationContext
      ? "📍 You're connected to " + locationContext.label + ". Just in case, please also tell me the table number printed beside you on the table."
      : null;
    const contextGreeting = isFirstMessage
      ? [welcome, locationGreeting].filter(Boolean).join("\n\n")
      : locationChanged
        ? locationGreeting
        : null;
    const finalReplyText = [contextGreeting, prepared.replyText].filter(Boolean).join("\n\n");
    db.mutate((state) => { db.addMessage(state, conversation.id, "assistant", finalReplyText); });
    return {
      replyText: finalReplyText,
      welcomeText: contextGreeting,
      assistantReplyText: prepared.replyText,
      mediaReplies,
      interactiveButtons: prepared.interactiveButtons,
      interactiveList: isTableQrEntry ? buildConciergeList(business.name) : null,
      order,
      customer,
      conversation,
    };
  }

  const isShopLinkEntry = isShopLinkTrigger(text, business);

   if (isFirstMessage || locationChanged) {
    if (isShopLinkEntry) {
      // Customer tapped the QR / shop link.
      // 1. Send the welcome message instantly (if one is configured).
      // 2. Then run the AI to fetch and present the live catalog as a second message.
      // Both land in sequence — greeting first, products right behind it.
       const locationGreeting = locationContext
         ? `Welcome to ${business.name}. You are at ${locationContext.label}. I can help you explore our services and place an order.`
         : null;
       const welcomeReply = locationGreeting ||
         String(business.welcomeMessage || "").trim() ||
         db.generateWelcomeMessage(business);
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
        extraReplies: [prepared.replyText], // sent immediately after
        interactiveButtons: prepared.interactiveButtons,
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

module.exports = {
  handleCustomerMessage,
  extractTableNumber,
  SHOP_LINK_TRIGGER,
  HOTEL_SHOP_LINK_TRIGGER,
  isShopLinkTrigger,
};
