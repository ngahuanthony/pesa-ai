const db = require("../db");
const auth = require("../auth");
const { categoryAttrs, normalizeTranscript } = require("../transcriptNormalizer");
const { cleanAiItems, fallbackInterpret } = require("../universalParser");

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
const OPENAI_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";

async function transcribeAudio(audioBuffer, contentType, business) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw db.httpError(503, "Voice transcription is not configured");
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) throw db.httpError(400, "Audio is required");
  if (audioBuffer.length > 15 * 1024 * 1024) throw db.httpError(413, "Voice recording must be under 15 MB");

  const products = db.listProducts(business.id).map((product) => product.name).slice(0, 250);
  const prompt = [
    "Kenyan merchant inventory update in English, Kiswahili, or Sheng.",
    `Business category: ${business.category || "general"}.`,
    `Catalogue vocabulary: ${products.join(", ")}.`,
    "Common terms: receive, sell, damage, missing, stock count, black, green, blue, nyeusi, kijani, pieces, kilo, litre, metre.",
  ].join(" ").slice(0, 1800);
  const extension = contentType.includes("mp4") ? "m4a" : contentType.includes("mpeg") ? "mp3" : "webm";
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: contentType || "audio/webm" }), `voice-stock.${extension}`);
  form.append("model", OPENAI_TRANSCRIPTION_MODEL);
  form.append("response_format", "json");
  form.append("prompt", prompt);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text();
    console.warn(`[voice-stock] transcription failed status=${response.status} detail=${detail.slice(0, 300)}`);
    throw db.httpError(502, "Voice transcription failed. Try again or type the update.");
  }
  const result = await response.json();
  const transcript = String(result.text || "").trim();
  if (!transcript) throw db.httpError(422, "No speech was detected");
  return { transcript, normalizedTranscript: normalizeTranscript(transcript), provider: "openai" };
}

async function claudeInterpret(transcript, business, products) {
  const catalog = products.map((product) => ({
    name: product.name,
    sku: product.sku || null,
    stockQty: product.stockQty,
    colors: Array.isArray(product.colorStock) ? product.colorStock.map((entry) => entry.color) : [],
  }));
  const category = String(business.category || "general").toLowerCase().replace(/\s+/g, "_");
  const attributes = categoryAttrs[category] || {};
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      system: [
        "Extract every inventory change from English, Kiswahili, or Sheng.",
        "Return JSON only: {items:[{productName,action,quantity,unit,color,size,evidence,confidence,actionWasImplicit}]}.",
        "Actions are receive, sell, damage, missing, or adjustment. If no action is spoken, use receive and set actionWasImplicit true.",
        "For adjustment, quantity is the counted stock, not an amount to add.",
        "Return one row per product variant. Ignore a spoken total when per-variant quantities are present.",
        "Do not invent products. productName must be one exact catalogue name.",
        `Business category: ${business.category || "general"}. Category attributes: ${JSON.stringify(attributes)}.`,
        `Catalogue: ${JSON.stringify(catalog)}.`,
      ].join(" "),
      messages: [{ role: "user", content: transcript }],
    }),
  });
  if (!response.ok) throw new Error("Claude interpretation request failed");
  const body = await response.json();
  const text = (body.content || []).filter((block) => block.type === "text").map((block) => block.text).join("");
  const json = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
  if (!Array.isArray(json.items)) throw new Error("Claude response has no items");
  return cleanAiItems(json.items, products);
}

async function interpret({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const business = db.getBusiness(params.businessId);
  const rawTranscript = body && typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (!rawTranscript) throw db.httpError(400, "transcript is required");
  if (rawTranscript.length > 4000) throw db.httpError(400, "transcript must be at most 4000 characters");
  const normalizedTranscript = normalizeTranscript(rawTranscript);
  const products = db.listProducts(params.businessId);
  let items;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      items = await claudeInterpret(normalizedTranscript, business, products);
    } catch (error) {
      console.warn(`[voice-stock] catalogue interpretation fallback: ${error.message}`);
      items = fallbackInterpret(normalizedTranscript, business, products);
    }
  } else {
    items = fallbackInterpret(normalizedTranscript, business, products);
  }
  return { transcript: rawTranscript, normalizedTranscript, items };
}

function confirm({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const items = body && Array.isArray(body.items) ? body.items : null;
  const transcript = body && body.transcript;
  if (!items || !items.length) throw db.httpError(400, "items must be a non-empty array");
  if (items.length > 100) throw db.httpError(400, "at most 100 items can be confirmed at once");
  if (transcript != null && typeof transcript !== "string") throw db.httpError(400, "transcript must be a string");
  if (transcript && transcript.length > 4000) throw db.httpError(400, "transcript must be at most 4000 characters");
  return db.confirmStockMovements(params.businessId, items, {
    transcript,
    accountId: session && session.accountId,
    requestId: body && body.requestId,
  });
}

function history({ params, query, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId);
  return db.listStockMovements(params.businessId, query.limit);
}

module.exports = { interpret, confirm, history, transcribeAudio };