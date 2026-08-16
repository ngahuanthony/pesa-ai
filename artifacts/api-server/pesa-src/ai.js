// The AI sales assistant. Talks to Claude with two tools it can call:
// search_products (look things up in this business's catalog) and
// create_order (actually place an order). This is what turns "a chatbot
// that answers questions" into "a chatbot that can sell things."
//
// If ANTHROPIC_API_KEY isn't set, we fall back to a small rule-based mock
// so the rest of the app (webhook, simulator, orders) can still be
// exercised and demoed without an API key. Real deployments should set
// the key — see .env.example.

const db = require("./db");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
const API_URL = "https://api.anthropic.com/v1/messages";

const TOOLS = [
  {
    name: "search_products",
    description:
      "Search this business's product catalog by keyword. Use this whenever the customer asks about products, prices, or availability before answering — don't guess.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keyword(s) to search for, e.g. 'phone case' or 'charger'. Leave empty to list everything.",
        },
      },
    },
  },
  {
    name: "create_order",
    description:
      "Place an order for the customer once they've clearly confirmed what they want to buy and in what quantity. Only call this after the customer has explicitly agreed — don't place an order just because they showed interest.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product_name: { type: "string", description: "Exact product name as returned by search_products" },
              quantity: { type: "integer", minimum: 1 },
            },
            required: ["product_name", "quantity"],
          },
        },
      },
      required: ["items"],
    },
  },
];

function systemPrompt(business, products) {
  const catalogSummary = products
    .filter((p) => p.active)
    .map((p) => `- ${p.name}: KES ${p.price} (${p.stockQty > 0 ? `${p.stockQty} in stock` : "out of stock"})`)
    .join("\n");

  const locationLine = business.location ? `Location: ${business.location}` : "";
  const deliveryLine = business.deliveryAreas ? `Delivery: ${business.deliveryAreas}` : "";
  const locationBlock = [locationLine, deliveryLine].filter(Boolean).join("\n");

  return `You are ${business.personaName}, the friendly AI sales assistant for "${business.name}", a ${business.category} business in Kenya that sells through WhatsApp.

Your job: help customers find products, answer questions about price/stock, and take their order when they're ready to buy. Be warm, concise, and conversational — this is WhatsApp, not email. Use short messages. Prices are in Kenyan Shillings (KES).
${locationBlock ? `\n${locationBlock}\n` : ""}
Rules:
- Always use search_products to check real prices/stock before answering — never make up product details.
- Only call create_order after the customer has clearly confirmed what and how much they want.
- If something is out of stock or doesn't exist, say so plainly and suggest alternatives from the catalog.
- If asked something unrelated to the business, gently steer back to how you can help them shop.
- Payment: for now, tell the customer the business will confirm payment details (M-Pesa) separately after the order is placed.
- When customers ask "where are you?", use your location info if available.

Current catalog:
${catalogSummary || "(no products added yet)"}`;
}

async function callClaude(messages, system) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

function executeTool(business, customerId, toolName, toolInput) {
  if (toolName === "search_products") {
    const query = (toolInput.query || "").toLowerCase().trim();
    const products = db.listProducts(business.id, { activeOnly: true });
    const matches = query
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            (p.description || "").toLowerCase().includes(query)
        )
      : products;
    return {
      results: matches.map((p) => ({
        name: p.name,
        price: p.price,
        stockQty: p.stockQty,
        description: p.description,
      })),
    };
  }

  if (toolName === "create_order") {
    return { __create_order__: toolInput.items };
  }

  return { error: `Unknown tool ${toolName}` };
}

// Runs the Claude tool-use loop for one customer turn and returns
// { replyText, order } — order is set if create_order was called.
async function runClaudeAssistant(business, customerId, history, userText) {
  const products = db.listProducts(business.id);
  const system = systemPrompt(business, products);

  const messages = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: userText },
  ];

  let order = null;
  const MAX_TURNS = 5;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await callClaude(messages, system);
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { replyText: text || "Sorry, I didn't quite catch that — could you rephrase?", order };
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const result = executeTool(business, customerId, block.name, block.input);
      if (result.__create_order__) {
        order = placeOrderFromToolCall(business, customerId, result.__create_order__);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(
            order.error ? { error: order.error } : { success: true, order_id: order.id, total: order.totalAmount }
          ),
        });
      } else {
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { replyText: "Sorry, I'm having trouble processing that right now — please try again shortly.", order };
}

function placeOrderFromToolCall(business, customerId, requestedItems) {
  const products = db.listProducts(business.id, { activeOnly: true });
  const resolved = [];
  for (const item of requestedItems) {
    const product = products.find((p) => p.name.toLowerCase() === String(item.product_name).toLowerCase());
    if (!product) return { error: `Product not found: ${item.product_name}` };
    if (product.stockQty < item.quantity) return { error: `Not enough stock for ${product.name}` };
    resolved.push({ productId: product.id, quantity: item.quantity });
  }
  return db.mutate((state) => db.createOrder(state, { businessId: business.id, customerId, items: resolved }));
}

// --- mock fallback (no API key) ------------------------------------------

function runMockAssistant(business, customerId, history, userText) {
  const products = db.listProducts(business.id, { activeOnly: true });
  const text = userText.toLowerCase();

  // very small "order: <product name> x<qty>" convention so the simulator
  // can still demonstrate order creation without a real model.
  const orderMatch = text.match(/order[:\s]+(.+?)(?:\s+x(\d+))?$/i);
  if (orderMatch) {
    const name = orderMatch[1].trim();
    const qty = Number(orderMatch[2] || 1);
    const product = products.find((p) => p.name.toLowerCase().includes(name));
    if (product && product.stockQty >= qty) {
      const order = db.mutate((state) =>
        db.createOrder(state, {
          businessId: business.id,
          customerId,
          items: [{ productId: product.id, quantity: qty }],
        })
      );
      return {
        replyText: `[mock AI — set ANTHROPIC_API_KEY for the real assistant] Order placed: ${qty} x ${product.name} for KES ${order.totalAmount}. We'll confirm M-Pesa payment shortly.`,
        order,
      };
    }
    return {
      replyText: `[mock AI] I couldn't find "${name}" in stock. Try asking "what do you have?".`,
      order: null,
    };
  }

  if (!products.length) {
    return { replyText: `[mock AI] Hi! I'm ${business.personaName}, but no products have been added yet.`, order: null };
  }

  const list = products
    .slice(0, 8)
    .map((p) => `${p.name} — KES ${p.price}`)
    .join(", ");
  return {
    replyText: `[mock AI — set ANTHROPIC_API_KEY for the real assistant] Hi, I'm ${business.personaName}! Here's what we have: ${list}. Say "order: <product name>" to buy.`,
    order: null,
  };
}

async function getAssistantReply(business, customerId, history, userText) {
  if (ANTHROPIC_API_KEY) {
    return runClaudeAssistant(business, customerId, history, userText);
  }
  return runMockAssistant(business, customerId, history, userText);
}

module.exports = { getAssistantReply };
