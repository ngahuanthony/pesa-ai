const db = require("../db");
const auth = require("../auth");
const { normalizeTranscript } = require("../transcriptNormalizer");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

const ACTIONS = ["receive", "sell", "damage", "missing", "adjustment"];

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function actionFor(text) {
  const value = normalize(text);
  if (/\b(damag|broken|spoil|haribika|imeharibika)\b/.test(value)) return "damage";
  if (/\b(missing|lost|stolen|theft|potea|imepotea|wizi)\b/.test(value)) return "missing";
  if (/\b(sold|sell|uza|nimeuza)\b/.test(value)) return "sell";
  if (/\b(adjust|correct|correction|set stock|rekebisha)\b/.test(value)) return "adjustment";
  if (/\b(receive|received|restock|delivery|delivered|ongeza|ongeza|pokea|nimepokea|ingiza)\b/.test(value)) return "receive";
  return null;
}

function dice(a, b) {
  const aa = normalize(a).split(" ").filter(Boolean);
  const bb = normalize(b).split(" ").filter(Boolean);
  const shared = aa.filter((word) => bb.includes(word)).length;
  return aa.length + bb.length ? (2 * shared) / (aa.length + bb.length) : 0;
}

function matchProduct(candidate, products) {
  const swahiliAliases = { maziwa: "milk", mkate: "bread", sukari: "sugar", chumvi: "salt", unga: "flour" };
  const normalizedCandidate = normalize(candidate);
  const target = swahiliAliases[normalizedCandidate] || normalizedCandidate;
  if (!target) return null;
  const exact = products.find((product) => normalize(product.name) === target);
  if (exact) return { product: exact, confidence: 1 };
  const contained = products
    .map((product) => ({ product, score: normalize(product.name).length > 2 && (target.includes(normalize(product.name)) || normalize(product.name).includes(target)) ? 0.9 : dice(target, product.name) }))
    .sort((a, b) => b.score - a.score);
  // A fuzzy result must be both strong and clearly better than its runner-up.
  if (contained[0] && contained[0].score >= 0.75 && (!contained[1] || contained[0].score - contained[1].score >= 0.15)) {
    return { product: contained[0].product, confidence: contained[0].score };
  }
  return null;
}

function proposal(candidate, action, quantity, unit, products, confidence, color = null) {
  const match = matchProduct(candidate, products);
  if (!match) {
    return {
      productId: null, productName: candidate || null, action: action || null,
      quantity: Number(quantity) || null, unit: unit || "units", confidence: 0,
      color: color || null, currentStock: null, proposedStock: null,
      colorCurrentStock: null, colorProposedStock: null,
      warning: "No confident match was found in this business catalogue. Select a catalogue product before confirming.",
    };
  }
  const qty = Number(quantity);
  const current = Number(match.product.stockQty);
  const normalizedColor = color ? String(color).trim() : null;
  const colorEntry = normalizedColor && Array.isArray(match.product.colorStock)
    ? match.product.colorStock.find((entry) => normalize(entry.color) === normalize(normalizedColor))
    : null;
  const colorCurrent = normalizedColor ? Number(colorEntry?.quantity || 0) : null;
  const colorNext = normalizedColor
    ? (action === "adjustment"
      ? qty
      : colorCurrent + (["sell", "damage", "missing"].includes(action) ? -qty : qty))
    : null;
  const next = action === "adjustment"
    ? (normalizedColor ? current + colorNext - colorCurrent : qty)
    : current + (["sell", "damage", "missing"].includes(action) ? -qty : qty);
  return {
    productId: match.product.id, productName: match.product.name, action,
    quantity: qty, unit: unit || "units", color: normalizedColor,
    confidence: Math.min(confidence || match.confidence, match.confidence),
    currentStock: current, proposedStock: next,
    colorCurrentStock: colorCurrent, colorProposedStock: colorNext,
    warning: !ACTIONS.includes(action) ? "Could not determine whether stock was received, sold, damaged, missing, or adjusted." :
      (!Number.isFinite(qty) || qty <= 0 ? "Could not determine a positive quantity." :
        (next < 0 || (colorNext !== null && colorNext < 0) ? "This change would make stock negative." : null)),
  };
}

function fallbackInterpret(transcript, products) {
  const normalizedTranscript = normalize(transcript);
  const mentionedProduct = products
    .filter((product) => normalizedTranscript.includes(normalize(product.name)))
    .sort((a, b) => normalize(b.name).length - normalize(a.name).length)[0];
  const commonAction = actionFor(transcript);
  const colors = "black|white|red|blue|green|yellow|orange|purple|pink|brown|grey|gray|silver|gold|beige|navy|maroon|cream|transparent";
  const colorItems = [];
  const seen = new Set();
  const patterns = [
    new RegExp(`\\b(${colors})\\s*(?:colour|color)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:pcs?|pieces?|units?|items?)?`, "gi"),
    new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*(?:pcs?|pieces?|units?|items?)?\\s*(?:of\\s+)?(${colors})\\b`, "gi"),
  ];
  for (const [patternIndex, pattern] of patterns.entries()) {
    for (const match of transcript.matchAll(pattern)) {
      const color = patternIndex === 0 ? match[1] : match[2];
      const quantity = patternIndex === 0 ? match[2] : match[1];
      const key = `${normalize(color)}:${quantity}:${match.index}`;
      if (!seen.has(key)) {
        seen.add(key);
        colorItems.push(proposal(mentionedProduct?.name, commonAction, quantity, "pcs", products, 0.8, color));
      }
    }
  }
  if (mentionedProduct && commonAction && colorItems.length) return colorItems;

  // Split at conjunctions only when the following phrase begins another
  // stock action. This preserves product names while allowing one utterance
  // to contain, for example, both a receipt and a sale.
  const actionWords = "received?|restock(?:ed)?|delivery|delivered|sold|sell|damage(?:d)?|broken|spoiled|missing|lost|stolen|adjust(?:ed)?|correct(?:ed)?|nimepokea|pokea|ongeza|ingiza|nimeuza|uza|imeharibika|haribika|imepotea|potea|rekebisha";
  const clauses = String(transcript)
    .split(new RegExp(`\\s*(?:,|;|\\band\\b|\\bna\\b)\\s*(?=(?:${actionWords})\\b)`, "i"))
    .filter(Boolean);
  const items = clauses.map((clause) => {
    const action = actionFor(clause);
    const quantityMatch = clause.match(/(\d+(?:\.\d+)?)\s*(?:packets?|pcs?|pieces?|units?|items?|loaves?|vipande?)?\s*(?:of|za|ya)?\s*(.+)$/i);
    if (!quantityMatch) return proposal(null, action, null, "units", products, 0);
    let candidate = quantityMatch[2].trim()
      .replace(/^(?:of|za|ya)\s+/i, "")
      .replace(/[.,;]+$/, "");
    // Action wording occurs before the number in supported commands. The
    // remainder after quantity is deliberately matched only to this business'
    // catalogue, never used to create a product.
    return proposal(candidate, action, quantityMatch[1], "units", products, 0.78);
  });
  return items.length ? items : [proposal(null, actionFor(transcript), null, "units", products, 0)];
}

async function claudeInterpret(transcript, products) {
  const catalog = products.map((product) => ({ name: product.name, stockQty: product.stockQty }));
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL, max_tokens: 600,
      system: "Extract every stock change from English or Kiswahili with exact detail. Return JSON only: {items:[{productName,action,quantity,unit,color,confidence}]}. action is receive, sell, damage, missing, or adjustment. When quantities are spoken per colour, return one item per colour and do not return the spoken total as another item; the system calculates the total. Preserve each colour exactly. For adjustment, quantity is the counted stock for that colour or product, not an amount to add. Do not invent products; use only names from this catalogue: " + JSON.stringify(catalog),
      messages: [{ role: "user", content: transcript }],
    }),
  });
  if (!response.ok) throw new Error("Claude interpretation request failed");
  const body = await response.json();
  const text = (body.content || []).filter((block) => block.type === "text").map((block) => block.text).join("");
  const json = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
  if (!Array.isArray(json.items)) throw new Error("Claude response has no items");
  return json.items.map((item) => proposal(item.productName, item.action, item.quantity, item.unit, products, Number(item.confidence) || 0.8, item.color));
}

async function interpret({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId);
  const rawTranscript = body && typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (!rawTranscript) throw db.httpError(400, "transcript is required");
  if (rawTranscript.length > 4000) throw db.httpError(400, "transcript must be at most 4000 characters");
  const transcript = normalizeTranscript(rawTranscript);
  const products = db.listProducts(params.businessId);
  let items;
  if (ANTHROPIC_API_KEY) {
    try { items = await claudeInterpret(transcript, products); }
    catch (_) { items = fallbackInterpret(transcript, products); }
  } else items = fallbackInterpret(transcript, products);
  return { transcript: rawTranscript, normalizedTranscript: transcript, items };
}

function confirm({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const items = body && Array.isArray(body.items) ? body.items : null;
  const transcript = body && body.transcript;
  if (!items || !items.length) throw db.httpError(400, "items must be a non-empty array");
  if (items.length > 100) throw db.httpError(400, "at most 100 items can be confirmed at once");
  if (transcript != null && typeof transcript !== "string") {
    throw db.httpError(400, "transcript must be a string");
  }
  if (transcript && transcript.length > 4000) {
    throw db.httpError(400, "transcript must be at most 4000 characters");
  }
  return db.confirmStockMovements(params.businessId, items, {
    transcript,
    accountId: session && session.accountId,
  });
}

function history({ params, query, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId);
  return db.listStockMovements(params.businessId, query.limit);
}

module.exports = { interpret, confirm, history };