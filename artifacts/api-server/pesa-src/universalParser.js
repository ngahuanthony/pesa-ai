const { categoryAttrs, normalizeTranscript } = require("./transcriptNormalizer");

const ACTIONS = ["receive", "sell", "damage", "missing", "adjustment"];
const DEDUCTIONS = new Set(["sell", "damage", "missing"]);

function normalize(value) {
  return normalizeTranscript(value).replace(/[^\p{L}\p{N}/.]+/gu, " ").trim();
}

function actionFor(text) {
  const value = normalize(text);
  if (/\b(damag(?:e|ed)?|broken|spoiled?|haribika|imeharibika)\b/.test(value)) return "damage";
  if (/\b(missing|lost|stolen|theft|potea|imepotea|wizi)\b/.test(value)) return "missing";
  if (/\b(sold|sell|uza|nimeuza)\b/.test(value)) return "sell";
  if (/\b(adjust(?:ed)?|correct(?:ed|ion)?|set stock|stock count|rekebisha)\b/.test(value)) return "adjustment";
  if (/\b(receive(?:d)?|restock(?:ed)?|delivery|delivered|ongeza|pokea|nimepokea|ingiza)\b/.test(value)) return "receive";
  return null;
}

function levenshtein(a, b) {
  const aa = normalize(a);
  const bb = normalize(b);
  const row = Array.from({ length: bb.length + 1 }, (_, index) => index);
  for (let i = 1; i <= aa.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= bb.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (aa[i - 1] === bb[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[bb.length];
}

function similarity(a, b) {
  const aa = normalize(a);
  const bb = normalize(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.92;
  return 1 - levenshtein(aa, bb) / Math.max(aa.length, bb.length);
}

function aliasesFor(product) {
  const name = normalize(product.name);
  const words = name.split(" ");
  const aliases = new Set([name]);
  if (words.length >= 3) aliases.add(words.slice(1).join(" "));
  for (const alias of product.voiceAliases || []) aliases.add(normalize(alias));
  if (product.sku) aliases.add(normalize(product.sku));
  return [...aliases].filter((alias) => alias.length >= 3);
}

function matchProduct(candidate, products) {
  const target = normalize(candidate);
  if (!target) return null;
  const exact = products.find((product) => normalize(product.name) === target);
  if (exact) return { product: exact, score: 1 };
  const ranked = products.map((product) => ({
    product,
    score: Math.max(...aliasesFor(product).map((alias) => similarity(target, alias))),
  })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < 0.72 || (second && best.score - second.score < 0.08)) return null;
  return best;
}

function confidenceLevel({ warning, confidence, actionWasImplicit }) {
  if (warning) return "blocked";
  if (actionWasImplicit || confidence < 0.9) return "review";
  return "high";
}

function proposal({ candidate, action, quantity, unit, products, confidence = 0.8, color = null, size = null, evidence = null, actionWasImplicit = false }) {
  const match = matchProduct(candidate, products);
  const qty = Number(quantity);
  if (!match) {
    const warning = "No confident catalogue match. Select the correct product before confirming.";
    return {
      productId: null, productName: candidate || null, action: action || null,
      quantity: Number.isFinite(qty) ? qty : null, unit: unit || "pieces",
      color, size, evidence, confidence: 0, confidenceLevel: "blocked",
      currentStock: null, proposedStock: null, colorCurrentStock: null,
      colorProposedStock: null, warning,
    };
  }
  const normalizedColor = color ? String(color).trim() : null;
  const rawSize = size ? String(size).trim() : "";
  const normalizedSize = rawSize && /^[a-z]{1,3}$/i.test(rawSize) ? rawSize.toUpperCase() : (rawSize || null);
  const current = Number(match.product.stockQty) || 0;
  const colorEntry = normalizedColor && Array.isArray(match.product.colorStock)
    ? match.product.colorStock.find((entry) => normalize(entry.color) === normalize(normalizedColor))
    : null;
  const colorCurrent = normalizedColor ? Number(colorEntry?.quantity || 0) : null;
  const colorNext = normalizedColor && ACTIONS.includes(action) && Number.isFinite(qty)
    ? (action === "adjustment" ? qty : colorCurrent + (DEDUCTIONS.has(action) ? -qty : qty))
    : null;
  const next = ACTIONS.includes(action) && Number.isFinite(qty)
    ? (action === "adjustment"
      ? (normalizedColor ? current + colorNext - colorCurrent : qty)
      : current + (DEDUCTIONS.has(action) ? -qty : qty))
    : null;
  const warning = !ACTIONS.includes(action)
    ? "Choose whether this stock was received, sold, damaged, missing, or counted."
    : (!Number.isFinite(qty) || qty <= 0
      ? "Enter a positive quantity."
      : (next < 0 || (colorNext !== null && colorNext < 0)
        ? "This change would make stock negative."
        : null));
  const calibrated = Math.min(Number(confidence) || 0, match.score);
  return {
    productId: match.product.id,
    productName: match.product.name,
    action,
    quantity: Number.isFinite(qty) ? qty : null,
    unit: unit || "pieces",
    color: normalizedColor,
    size: normalizedSize,
    evidence,
    confidence: calibrated,
    confidenceLevel: confidenceLevel({ warning, confidence: calibrated, actionWasImplicit }),
    currentStock: current,
    proposedStock: next,
    colorCurrentStock: colorCurrent,
    colorProposedStock: colorNext,
    warning,
  };
}

function catalogueMentions(transcript, products) {
  const text = normalize(transcript);
  const mentions = [];
  for (const product of products) {
    for (const alias of aliasesFor(product)) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`\\b${escaped}\\b`, "g");
      for (const result of text.matchAll(pattern)) {
        mentions.push({ index: result.index, end: result.index + result[0].length, product, alias });
      }
    }
  }
  return mentions
    .sort((a, b) => a.index - b.index || b.alias.length - a.alias.length)
    .filter((mention, index, all) => !all.slice(0, index).some((prior) => prior.index <= mention.index && prior.end >= mention.end));
}

function parseVariantPairs(segment, attrs) {
  const colors = new Set(attrs.colors || []);
  const words = normalize(segment).split(" ").filter(Boolean);
  const rows = [];
  for (let i = 0; i < words.length; i += 1) {
    if (!colors.has(words[i])) continue;
    const quantity = Number(words[i + 1]);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const sizeIndex = words.slice(i + 2, i + 6).findIndex((word) => word === "size");
    const size = sizeIndex >= 0 ? words[i + 2 + sizeIndex + 1] : null;
    rows.push({ color: words[i], quantity, size, evidence: `${words[i]} ${words[i + 1]}` });
  }
  return rows;
}

function fallbackInterpret(transcript, business, products) {
  const text = normalize(transcript);
  const category = String(business.category || "general").toLowerCase().replace(/\s+/g, "_");
  const attrs = categoryAttrs[category] || { colors: ["black", "green", "blue", "red", "white", "yellow"], units: ["pieces"] };
  const explicitAction = actionFor(text);
  const mentions = catalogueMentions(text, products);
  const items = [];
  for (let index = 0; index < mentions.length; index += 1) {
    const mention = mentions[index];
    const previous = mentions[index - 1];
    const next = mentions[index + 1];
    const before = text.slice(previous ? previous.end : 0, mention.index);
    const segment = text.slice(mention.end, next ? next.index : text.length);
    const localAction = actionFor(before);
    const action = localAction || explicitAction || "receive";
    const actionWasImplicit = !localAction && !explicitAction;
    const variants = parseVariantPairs(segment, attrs);
    if (variants.length) {
      for (const variant of variants) {
        items.push(proposal({
          candidate: mention.product.name, action, quantity: variant.quantity,
          unit: attrs.units?.[0] || "pieces", color: variant.color, size: variant.size,
          evidence: `${mention.alias} ${variant.evidence}`, products,
          confidence: mention.alias === normalize(mention.product.name) ? 0.98 : 0.9,
          actionWasImplicit,
        }));
      }
      continue;
    }
    const afterQuantity = segment.match(/\b(\d+(?:\.\d+)?)\b/);
    const beforeQuantities = [...before.matchAll(/\b(\d+(?:\.\d+)?)\b/g)];
    const beforeQuantity = beforeQuantities[beforeQuantities.length - 1];
    const quantityMatch = (localAction && beforeQuantity) || afterQuantity || beforeQuantity;
    const color = (attrs.colors || []).find((candidate) => new RegExp(`\\b${candidate}\\b`).test(segment)) || null;
    const unit = (attrs.units || []).find((candidate) => new RegExp(`\\b${candidate}s?\\b`).test(segment)) || attrs.units?.[0] || "pieces";
    const labelledSize = segment.match(/\bsize\s+([a-z0-9/.-]+)\b/i);
    const measuredSize = segment.match(/\b(?:inch|inches)\s+(\d+(?:\/\d+)?)\b/i) ||
      segment.match(/\b(\d+(?:\/\d+)?)\s*(?:inch|inches)\b/i);
    const size = labelledSize?.[1] || (measuredSize ? `${measuredSize[1]} inch` : null);
    items.push(proposal({
      candidate: mention.product.name, action, quantity: quantityMatch?.[1],
      unit, color, size, products,
      evidence: `${mention.alias}${quantityMatch ? ` ${quantityMatch[1]}` : ""}`,
      confidence: mention.alias === normalize(mention.product.name) ? 0.96 : 0.88,
      actionWasImplicit,
    }));
  }
  if (items.length) return items;

  const quantityMatch = text.match(/\b(\d+(?:\.\d+)?)\b/);
  const candidate = text
    .replace(/\b(received?|sold|sell|damaged?|missing|adjust(?:ed)?|stock|count|pieces?|pcs?|units?)\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\b/g, " ")
    .replace(/\s+/g, " ").trim();
  return [proposal({
    candidate, action: explicitAction || "receive", quantity: quantityMatch?.[1], products,
    unit: attrs.units?.[0] || "pieces", evidence: text,
    confidence: 0.74, actionWasImplicit: !explicitAction,
  })];
}

function cleanAiItems(items, products) {
  return items.map((item) => proposal({
    candidate: item.productName || item.product_search,
    action: item.action,
    quantity: item.quantity ?? item.qty,
    unit: item.unit,
    color: item.color,
    size: item.size,
    evidence: item.evidence,
    products,
    confidence: Number(item.confidence) || 0.82,
    actionWasImplicit: Boolean(item.actionWasImplicit),
  }));
}

module.exports = {
  ACTIONS,
  matchProduct,
  proposal,
  fallbackInterpret,
  cleanAiItems,
  normalize,
};