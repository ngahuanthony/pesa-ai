// The one function both WhatsApp (real customers) and the dashboard's
// Chat Tester (you, testing) go through. Keeping this shared is what
// guarantees "works in the simulator" == "works on real WhatsApp."

const db = require("./db");
const { getAssistantReply } = require("./ai");

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

function isHandoverRequest(text) {
  const lower = (text || "").toLowerCase();
  return HANDOVER_TRIGGERS.some((t) => lower.includes(t));
}

async function handleCustomerMessage({ business, customerPhone, customerName, text, channel }) {
  const { customer, conversation } = db.mutate((state) => {
    const customer      = db.findOrCreateCustomer(state, business.id, customerPhone, customerName);
    const conversation  = db.findOrCreateConversation(state, business.id, customer.id, channel);
    db.addMessage(state, conversation.id, "customer", text);
    return { customer, conversation };
  });

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

  if (isFirstMessage) {
    if (isShopLinkEntry) {
      // Customer tapped the QR / shop link.
      // 1. Send the welcome message instantly (if one is configured).
      // 2. Then run the AI to fetch and present the live catalog as a second message.
      // Both land in sequence — greeting first, products right behind it.
      const welcomeReply = business.welcomeMessage || null;
      if (welcomeReply) {
        db.mutate((state) => {
          db.addMessage(state, conversation.id, "assistant", welcomeReply);
        });
      }

      const { replyText: catalogReply, order } = await getAssistantReply(
        business, customer.id, [], text,
        { shopEntry: true }
      );
      db.mutate((state) => {
        db.addMessage(state, conversation.id, "assistant", catalogReply);
      });

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
      return { replyText: business.welcomeMessage, order: null, customer, conversation };
    }
  }

  const { replyText, order } = await getAssistantReply(business, customer.id, priorHistory, text);

  db.mutate((state) => {
    db.addMessage(state, conversation.id, "assistant", replyText);
  });

  return { replyText, order, customer, conversation };
}

module.exports = { handleCustomerMessage };
