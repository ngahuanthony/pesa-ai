const db = require("../db");
const auth = require("../auth");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const MAX_UPLOAD_BYTES = 1.5 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 100000;
const MIME_TYPES = new Set([
  "text/plain",
  "text/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function cleanExtractedText(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);
}

function extractDocx(buffer) {
  const tempPath = path.join(os.tmpdir(), `pesa-si-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.docx`);
  try {
    fs.writeFileSync(tempPath, buffer, { mode: 0o600 });
    const result = spawnSync("unzip", ["-p", tempPath, "word/document.xml"], {
      encoding: "utf8",
      maxBuffer: MAX_EXTRACTED_CHARS * 4,
      timeout: 5000,
    });
    if (result.error || result.status !== 0 || !result.stdout) {
      throw db.httpError(422, "DOCX could not be read as a text document");
    }
    return result.stdout
      .replace(/<\/w:p>/gi, "\n")
      .replace(/<w:tab\/?>/gi, "\t")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  } finally {
    try { fs.unlinkSync(tempPath); } catch (_) {}
  }
}

function extractPdf(buffer) {
  const result = spawnSync("pdftotext", ["-layout", "-", "-"], {
    input: buffer,
    encoding: "utf8",
    maxBuffer: MAX_EXTRACTED_CHARS * 4,
    timeout: 10000,
  });
  if (result.error && result.error.code === "ENOENT") {
    throw db.httpError(503, "PDF text extraction is not available on this server");
  }
  if (result.status !== 0 && !result.stdout) {
    throw db.httpError(422, "PDF could not be read as a text document");
  }
  return result.stdout || "";
}

function extractPreview({ params, body, session }) {
  own(session, params.businessId);
  const fileName = String(body && body.fileName || "").trim().slice(0, 200);
  const mimeType = String(body && body.mimeType || "").split(";")[0].toLowerCase();
  if (!fileName || !mimeType || !MIME_TYPES.has(mimeType)) {
    throw db.httpError(415, "Supported uploads are text-based PDF, DOCX, or TXT files");
  }
  if (typeof (body && body.base64) !== "string" || !body.base64) {
    throw db.httpError(400, "base64 file content is required");
  }
  const encoded = body.base64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw db.httpError(400, "base64 file content is invalid");
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw db.httpError(400, "Uploaded file is empty");
  if (buffer.length > MAX_UPLOAD_BYTES) throw db.httpError(413, "Uploaded file must be 1.5 MB or smaller");
  let raw;
  if (mimeType === "application/pdf") raw = extractPdf(buffer);
  else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") raw = extractDocx(buffer);
  else raw = buffer.toString("utf8");
  const text = cleanExtractedText(raw);
  if (!text) {
    throw db.httpError(422, "No selectable text was found. Scanned or image-only documents are unsupported.");
  }
  const warnings = [];
  if (text.length === MAX_EXTRACTED_CHARS) warnings.push(`Preview truncated to ${MAX_EXTRACTED_CHARS} characters.`);
  warnings.push("Preview only: review it and explicitly save it as approved knowledge before the AI can use it.");
  return { text, fileName, warnings };
}

function own(session, businessId) {
  auth.requireOwnBusiness(session, businessId);
  db.getBusiness(businessId);
}

const knowledge = {
  list({ params, session }) { own(session, params.businessId); return db.listKnowledgeEntries(params.businessId); },
  create({ params, body, session }) { own(session, params.businessId); return { status: 201, data: db.createKnowledgeEntry(params.businessId, body || {}) }; },
  extract: extractPreview,
  update({ params, body, session }) { own(session, params.businessId); return db.updateKnowledgeEntry(params.businessId, params.entryId, body || {}); },
  remove({ params, session }) { own(session, params.businessId); return db.deleteKnowledgeEntry(params.businessId, params.entryId); },
};

const locations = {
  list({ params, session }) { own(session, params.businessId); return db.listServiceLocations(params.businessId); },
  create({ params, body, session }) { own(session, params.businessId); return { status: 201, data: db.createServiceLocation(params.businessId, body || {}) }; },
  update({ params, body, session }) { own(session, params.businessId); return db.updateServiceLocation(params.businessId, params.locationId, body || {}); },
  remove({ params, session }) { own(session, params.businessId); return db.deleteServiceLocation(params.businessId, params.locationId); },
  resolve({ params }) {
    const result = db.resolveServiceLocation(params.token);
    if (!result) throw db.httpError(404, "Service location not found or inactive");
    const business = result.business;
    const whatsappPhone = String(business.whatsappNumber || "").replace(/\D/g, "");
    const platformPhoneNumberId = String(process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || "");
    const whatsappConnected = Boolean(
      business.whatsappPhoneNumberId &&
      whatsappPhone &&
      (business.whatsappAccessTokenEnc || business.whatsappConnectionStatus === "live" || String(business.whatsappPhoneNumberId) === platformPhoneNumberId)
    );
    if (!whatsappConnected) throw db.httpError(503, "This business is not currently available on WhatsApp");
    return {
      business: { name: business.name, whatsappPhone, whatsappConnected: true },
      location: { label: result.location.label, kind: result.location.kind },
    };
  },
};

module.exports = { knowledge, locations };