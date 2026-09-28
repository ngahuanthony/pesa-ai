const OPTIONS = [
  {
    id: "concierge:food",
    title: "Order Food",
    description: "Browse food and drinks; place a table order.",
    prompt: "Please show me the complete current food and drinks menu, grouped by category with prices.",
  },
  {
    id: "concierge:rooms",
    title: "Rooms",
    description: "Ask about rooms, rates, and availability.",
    prompt: "Tell me about your rooms, current rates, and availability.",
  },
  {
    id: "concierge:pool",
    title: "Swimming Pool",
    description: "Ask about pool access and facilities.",
    prompt: "Tell me about the rooftop swimming pool, access prices, and opening hours.",
  },
  {
    id: "concierge:conferences",
    title: "Conferences",
    description: "Ask about conference and meeting packages.",
    prompt: "Tell me about conference and meeting packages.",
  },
  {
    id: "concierge:events",
    title: "Events",
    description: "Ask about celebrations and event services.",
    prompt: "Tell me about events and celebrations hosted here.",
  },
  {
    id: "concierge:hotel_info",
    title: "Hotel Information",
    description: "Ask about facilities, location, and services.",
    prompt: "Tell me about the hotel's location, facilities, and services.",
  },
];

function buildConciergeList(businessName) {
  return {
    header: String(businessName || "Hotel concierge").slice(0, 60),
    body: "What would you like help with? Choose an option below.",
    footer: "You can also type your question.",
    button: "Explore services",
    sectionTitle: "Hotel services",
    rows: OPTIONS.map(({ id, title, description }) => ({ id, title, description })),
  };
}

function getConciergePrompt(optionId) {
  return OPTIONS.find((option) => option.id === optionId)?.prompt || null;
}

function buildWhatsAppListPayload(to, list) {
  if (!list || !Array.isArray(list.rows) || !list.rows.length || list.rows.length > 10) {
    throw new Error("WhatsApp list messages require between 1 and 10 rows");
  }
  if (String(list.button || "").length > 20) throw new Error("WhatsApp list button text exceeds 20 characters");
  for (const row of list.rows) {
    if (!row.id || String(row.id).length > 200) throw new Error("WhatsApp list row IDs must be 1–200 characters");
    if (!row.title || String(row.title).length > 24) throw new Error("WhatsApp list row titles must be 1–24 characters");
    if (String(row.description || "").length > 72) throw new Error("WhatsApp list row descriptions must be at most 72 characters");
  }

  const interactive = {
    type: "list",
    body: { text: list.body },
    action: {
      button: list.button,
      sections: [{
        title: list.sectionTitle,
        rows: list.rows.map(({ id, title, description }) => ({ id, title, description })),
      }],
    },
  };
  if (list.header) interactive.header = { type: "text", text: list.header };
  if (list.footer) interactive.footer = { text: list.footer };

  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive,
  };
}

module.exports = { buildConciergeList, buildWhatsAppListPayload, getConciergePrompt };