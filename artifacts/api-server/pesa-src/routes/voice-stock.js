const crypto = require("node:crypto");
const db = require("../db");
const auth = require("../auth");
const productImages = require("../product-images");
const { categoryAttrs, normalizeTranscript } = require("../transcriptNormalizer");
const { cleanAiItems, fallbackInterpret } = require("../universalParser");

const GROQ_MODEL = "whisper-large-v3";
const GROQ_PROMPT = "Pesa AI duka Samsung Fold Tecno Infinix black green blue nyeusi kijani tano kumi pieces";
const OPENAI_MODEL = "gpt-4o-mini";
const FALLBACK_PROMPT = GROQ_PROMPT;
const MAX_VOICE_TRANSCRIPT_CHARS = 12000;
const MAX_VOICE_ITEMS = 100;

function mediaType(contentType) {
  return String(contentType || "audio/webm").split(";", 1)[0].trim().toLowerCase();
}

function extensionFor(contentType) {
  switch (mediaType(contentType)) {
    case "audio/mp4": return "mp4";
    case "audio/m4a":
    case "audio/x-m4a": return "m4a";
    case "audio/mpeg": return "mp3";
    case "audio/ogg": return "ogg";
    case "audio/wav":
    case "audio/x-wav": return "wav";
    case "audio/webm": return "webm";
    default: return "audio";
  }
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function transcriptConfidence(result, transcript) {
  if (typeof result.confidence === "number") return clamp(result.confidence);
  if (Array.isArray(result.segments) && result.segments.length) {
    const values = result.segments.map((segment) => {
      if (typeof segment.no_speech_prob === "number") return clamp(1 - segment.no_speech_prob);
      if (typeof segment.avg_logprob === "number") return clamp((segment.avg_logprob + 1.5) / 1.5);
      return 0.8;
    });
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return transcript ? 0.8 : 0;
}

async function transcribeWithGroq(audioBuffer, contentType) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: mediaType(contentType) }), `voice-stock.${extensionFor(contentType)}`);
  form.append("model", GROQ_MODEL);
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  form.append("prompt", GROQ_PROMPT);
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 300);
    throw new Error(`Groq transcription failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const result = await response.json();
  const transcript = String(result.text || "").trim();
  if (!transcript) throw new Error("Groq returned an empty transcript");
  return { transcript, confidence: transcriptConfidence(result, transcript) };
}

async function transcribeWithFasterWhisper(audioBuffer, contentType) {
  const configuredUrl = process.env.FASTER_WHISPER_URL;
  if (!configuredUrl) throw new Error("FASTER_WHISPER_URL is not configured");
  const endpoint = configuredUrl.endsWith("/transcribe")
    ? configuredUrl
    : `${configuredUrl.replace(/\/+$/, "")}/transcribe`;
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: mediaType(contentType) }), `voice-stock.${extensionFor(contentType)}`);
  form.append("language", "auto");
  form.append("task", "transcribe");
  form.append("prompt", FALLBACK_PROMPT);
  const response = await fetch(endpoint, { method: "POST", body: form });
  if (!response.ok) throw new Error(`faster-whisper transcription failed (${response.status})`);
  const result = await response.json();
  const transcript = String(result.text || result.transcript || "").trim();
  if (!transcript) throw new Error("faster-whisper returned an empty transcript");
  return { transcript, confidence: transcriptConfidence(result, transcript) };
}

function base64url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function googleAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const assertion = `${header}.${claim}.${base64url(signer.sign(credentials.private_key))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Google OAuth failed (${response.status})`);
  const result = await response.json();
  if (!result.access_token) throw new Error("Google OAuth returned no access token");
  return result.access_token;
}

async function transcribeWithGoogle(audioBuffer, contentType) {
  const rawCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!rawCredentials) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not configured");
  const credentials = JSON.parse(rawCredentials);
  credentials.private_key = String(credentials.private_key || "").replace(/\\n/g, "\n");
  const encoding = mediaType(contentType) === "audio/webm" ? "WEBM_OPUS" : "ENCODING_UNSPECIFIED";
  const response = await fetch("https://speech.googleapis.com/v1/speech:recognize", {
    method: "POST",
    headers: {
      authorization: `Bearer ${await googleAccessToken(credentials)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      config: {
        encoding,
        languageCode: "en-KE",
        alternativeLanguageCodes: ["sw-KE"],
        model: "latest_long",
        enableAutomaticPunctuation: true,
      },
      audio: { content: audioBuffer.toString("base64") },
    }),
  });
  if (!response.ok) throw new Error(`Google Speech-to-Text failed (${response.status})`);
  const result = await response.json();
  const transcript = (result.results || []).map((item) => item.alternatives?.[0]?.transcript || "").join(" ").trim();
  if (!transcript) throw new Error("Google returned an empty transcript");
  const scores = (result.results || []).flatMap((item) => item.alternatives?.[0]?.confidence ?? []);
  const confidence = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0.8;
  return { transcript, confidence };
}

async function transcribeAudio(audioBuffer, contentType, business) {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) throw db.httpError(400, "Audio is required");
  if (audioBuffer.length > 15 * 1024 * 1024) throw db.httpError(413, "Voice recording must be under 15 MB");

  let provider = "groq";
  let fallbackUsed = false;
  let result;
  let groqError;
  try {
    result = await transcribeWithGroq(audioBuffer, contentType);
  } catch (error) {
    groqError = error;
  }

  const shouldFallback = !result || result.confidence < 0.65 || result.transcript.replace(/\s/g, "").length < 3;
  if (shouldFallback) {
    const candidates = [];
    if (process.env.FASTER_WHISPER_URL) candidates.push(["faster-whisper", transcribeWithFasterWhisper]);
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) candidates.push(["google", transcribeWithGoogle]);
    let fallbackError;
    for (const [fallbackProvider, transcriber] of candidates) {
      try {
        result = await transcriber(audioBuffer, contentType);
        provider = fallbackProvider;
        fallbackUsed = true;
        break;
      } catch (error) {
        fallbackError = error;
        console.warn(`[voice-stock] ${fallbackProvider} fallback failed: ${error.message}`);
      }
    }
    if (!result && groqError) {
      throw db.httpError(503, `Groq transcription failed and all configured fallbacks were unavailable: ${fallbackError?.message || groqError.message}`);
    }
  }

  const transcript = result.transcript.trim();
  return {
    transcript,
    normalizedTranscript: normalizeTranscript(transcript),
    provider,
    confidence: result.confidence,
    fallbackUsed,
    audioDeleted: true,
    businessId: business.id,
  };
}

async function openAiInterpret(transcript, business, products) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const catalog = products.map((product) => product.name).slice(0, 250);
  const category = String(business.category || "general").toLowerCase().replace(/\s+/g, "_");
  const attributes = categoryAttrs[category] || {};
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: [
           "Extract every inventory change from English, Kiswahili, or Sheng. Process every line and return one item per product movement; do not stop after the first few lines.",
          "Return JSON only: {items:[{product_search,action,quantity,unit,color,size,evidence,confidence,actionWasImplicit}]}.",
          "Never return productId. product_search must be a catalogue name or exact spoken product phrase for deterministic matching.",
          "Actions are receive, sell, damage, missing, or adjustment. If action is omitted, use receive and actionWasImplicit true.",
          `Business category: ${business.category || "general"}. Category attributes: ${JSON.stringify(attributes)}.`,
          `Catalogue names: ${JSON.stringify(catalog)}.`,
        ].join(" ") },
        { role: "user", content: transcript },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI extraction failed (${response.status})`);
  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content || "";
  const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
  if (!Array.isArray(parsed.items)) throw new Error("OpenAI extraction returned no items");
  return cleanAiItems(parsed.items, products);
}

async function interpret({ params, body, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const business = db.getBusiness(params.businessId);
  const rawTranscript = body && typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (!rawTranscript) throw db.httpError(400, "transcript is required");
  if (rawTranscript.length > MAX_VOICE_TRANSCRIPT_CHARS) throw db.httpError(400, `transcript must be at most ${MAX_VOICE_TRANSCRIPT_CHARS} characters`);
  const normalizedTranscript = normalizeTranscript(rawTranscript);
  const products = db.listProducts(params.businessId);
  let items;
  if (process.env.OPENAI_API_KEY) {
    try {
      items = await openAiInterpret(normalizedTranscript, business, products);
    } catch (error) {
      console.warn(`[voice-stock] OpenAI interpretation fallback: ${error.message}`);
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
  if (items.length > MAX_VOICE_ITEMS) throw db.httpError(400, `at most ${MAX_VOICE_ITEMS} items can be confirmed at once`);
  if (transcript != null && typeof transcript !== "string") throw db.httpError(400, "transcript must be a string");
  if (transcript && transcript.length > MAX_VOICE_TRANSCRIPT_CHARS) throw db.httpError(400, `transcript must be at most ${MAX_VOICE_TRANSCRIPT_CHARS} characters`);
  return db.confirmStockMovements(params.businessId, items, {
    transcript,
    accountId: session && session.accountId,
    requestId: body && body.requestId,
  });
}

async function uploadVariantImage({ params, query, body, contentType, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  const productId = String(query?.productId || "").trim();
  const color = String(query?.color || "default").trim();
  if (!productId) throw db.httpError(400, "productId is required");
  if (!color || color.length > 50) throw db.httpError(400, "color must be between 1 and 50 characters");
  const product = db.listProducts(params.businessId).find((item) => item.id === productId);
  if (!product) throw db.httpError(404, "Product not found for this business");
  try {
    return await productImages.uploadVariantImage({
      businessId: params.businessId,
      productId,
      color,
      imageBuffer: body,
      contentType,
    });
  } catch (error) {
    throw db.httpError(400, error.message);
  }
}

function history({ params, query, session }) {
  auth.requireOwnBusiness(session, params.businessId);
  db.getBusiness(params.businessId);
  return db.listStockMovements(params.businessId, query.limit);
}

module.exports = { interpret, confirm, history, transcribeAudio, uploadVariantImage };
