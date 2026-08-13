// The one function both WhatsApp (real customers) and the dashboard's
// Chat Tester (you, testing) go through. Keeping this shared is what
// guarantees "works in the simulator" == "works on real WhatsApp."

const db = require("./db");
const { getAssistantReply } = require("./ai");

async function handleCustomerMessage({ business, customerPhone, customerName, text, channel }) {
  const { customer, conversation } = db.mutate((state) => {
    const customer = db.findOrCreateCustomer(state, business.id, customerPhone, customerName);
    const conversation = db.findOrCreateConversation(state, business.id, customer.id, channel);
    db.addMessage(state, conversation.id, "customer", text);
    return { customer, conversation };
  });

  const { messages: history } = db.getConversationHistory(business.id, customerPhone, 20);
  // history includes the message we just added — drop it, the assistant gets it as userText
  const priorHistory = history.slice(0, -1);

  const { replyText, order } = await getAssistantReply(business, customer.id, priorHistory, text);

  db.mutate((state) => {
    db.addMessage(state, conversation.id, "assistant", replyText);
  });

  return { replyText, order, customer, conversation };
}

module.exports = { handleCustomerMessage };
