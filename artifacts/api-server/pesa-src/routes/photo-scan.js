// Photo Batch Scan — AI-powered product detection from photos.
//
// POST /api/businesses/:businessId/photo-scan
//   Body: { photos: [{ dataUrl: "data:image/jpeg;base64,...", filename }] }
//   Returns: { drafts: [{ tempId, name, suggestedPrice, description, category, imageDataUrl }] }
//
// POST /api/businesses/:businessId/photo-scan/confirm
//   Body: { items: [{ name, price, description, stockQty }] }
//   Returns: { ok, created, products }

const db   = require("../db");
const auth = require("../auth");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL  = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
const API_URL = "https://api.anthropic.com/v1/messages";

// Extract media type and base64 payload from a data URL.
function parseDataUrl(dataUrl) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid image data URL");
  return { mediaType: m[1], data: m[2] };
}

// Call Claude Vision to extract product details from one image.
async function analyzePhoto(dataUrl) {
  if (!ANTHROPIC_API_KEY) {
    // Graceful fallback so the UI is testable without an API key.
    return { name: "Product (set ANTHROPIC_API_KEY for AI detection)", suggestedPrice: 0, description: "", category: "General" };
  }

  const { mediaType, data } = parseDataUrl(dataUrl);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          {
            type: "text",
            text: `You are helping a Kenyan shop owner add products to their WhatsApp shop.
Look at this product photo and extract the product details.

Reply ONLY with a valid JSON object (no markdown, no extra text):
{
  "name": "Short product name (e.g. 'iPhone 13 Case - Black', 'Samsung A54 Screen Protector')",
  "suggestedPrice": <number in KES — 0 if unknown>,
  "description": "1-2 sentence description suitable for WhatsApp",
  "category": "one of: Electronics, Phones & Accessories, Clothing, Food & Drinks, Beauty, Home & Kitchen, General"
}

If you cannot identify a product clearly, use name "Unidentified Product" and suggestedPrice 0.`,
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Claude API ${res.status}: ${t.slice(0, 200)}`);
  }

  const result = await res.json();
  const text = (result.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .replace(/```json?\n?/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    return { name: "Unidentified Product", suggestedPrice: 0, description: text.slice(0, 200), category: "General" };
  }
}

// POST /api/businesses/:businessId/photo-scan
async function analyzePhotos({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);

  const photos = body?.photos;
  if (!Array.isArray(photos) || photos.length === 0) throw db.httpError(400, "photos array is required");
  if (photos.length > 20) throw db.httpError(400, "Maximum 20 photos per batch");

  // Analyse all photos in parallel (Claude handles concurrency fine at this scale).
  const drafts = await Promise.all(
    photos.map(async (photo, i) => {
      try {
        const ai = await analyzePhoto(photo.dataUrl);
        return {
          tempId:         `draft-${Date.now()}-${i}`,
          name:           String(ai.name          || "Unnamed Product"),
          suggestedPrice: Number(ai.suggestedPrice || 0),
          description:    String(ai.description   || ""),
          category:       String(ai.category      || "General"),
          imageDataUrl:   photo.dataUrl,
          filename:       photo.filename || `photo-${i + 1}`,
        };
      } catch (err) {
        return {
          tempId:         `draft-${Date.now()}-${i}`,
          name:           `Photo ${i + 1} — analysis failed`,
          suggestedPrice: 0,
          description:    "",
          category:       "General",
          imageDataUrl:   photo.dataUrl,
          filename:       photo.filename || `photo-${i + 1}`,
          error:          err.message,
        };
      }
    })
  );

  return { drafts };
}

// POST /api/businesses/:businessId/photo-scan/confirm
function confirmPhotoDrafts({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);

  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) throw db.httpError(400, "items array is required");

  const rows = items.map((item) => ({
    name:        String(item.name        || "").trim(),
    price:       Number(item.price)      || 0,
    description: String(item.description || "").trim(),
    stockQty:    Number(item.stockQty)   || 0,
    active:      true,
  }));

  const invalid = rows.filter((r) => !r.name || r.price <= 0);
  if (invalid.length) throw db.httpError(400, `${invalid.length} item(s) missing name or valid price`);

  const { created } = db.bulkCreateProducts(params.businessId, rows);
  return { ok: true, created: created.length, products: created };
}

module.exports = { analyzePhotos, confirmPhotoDrafts };
