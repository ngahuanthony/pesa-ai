const crypto = require("crypto");
const db = require("./db");

const COOKIE_NAME = "pesa_setup";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const creationBuckets = new Map();

function limitNewDrafts(req) {
  const remote = String(req?.socket?.remoteAddress || "").trim().replace(/^::ffff:/, "");
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",").map((item) => item.trim()).filter(Boolean);
  const realIp = String(req?.headers?.["x-real-ip"] || "").trim();
  // Trust forwarding headers only when the connecting peer is our loopback
  // nginx or the private-network ingress. Direct public clients cannot spoof
  // their rate-limit identity by sending X-Forwarded-For themselves.
  const trustedProxy = remote === "::1" || /^127\./.test(remote) || /^10\./.test(remote) ||
    /^192\.168\./.test(remote) || /^172\.(1[6-9]|2\d|3[01])\./.test(remote);
  const client = trustedProxy ? (forwarded[forwarded.length - 1] || realIp || remote) : remote;
  if (!client) return;
  const key = `client:${client}`;
  const currentTime = Date.now();
  const recent = (creationBuckets.get(key) || []).filter((time) => time > currentTime - HOUR_MS);
  if (recent.length >= 10) throw db.httpError(429, "Too many setup drafts started. Return to your existing draft or try again later.");
  recent.push(currentTime);
  creationBuckets.set(key, recent);
  if (creationBuckets.size > 10000) {
    for (const [key, times] of creationBuckets) {
      if (times.every((time) => time <= currentTime - HOUR_MS)) creationBuckets.delete(key);
    }
  }
}

function cookie(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${secure}`;
}

function tokenFromRequest(req) {
  const part = String(req?.headers?.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(COOKIE_NAME + "="));
  return part ? part.slice(COOKIE_NAME.length + 1) : null;
}

function findDraft(state, token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ""))) return null;
  const hash = crypto.createHash("sha256").update(token).digest();
  return (state.shopDrafts || []).find((draft) =>
    !draft.importedAt &&
    new Date(draft.expiresAt).getTime() > Date.now() &&
    /^[a-f0-9]{64}$/.test(String(draft.secretHash || "")) &&
    crypto.timingSafeEqual(Buffer.from(draft.secretHash, "hex"), hash)
  ) || null;
}

function requireDraft(state, token) {
  const draft = findDraft(state, token);
  if (!draft) throw db.httpError(401, "Your setup draft is not available in this browser. Start a new draft.");
  return draft;
}

function view(draft) {
  const { businessName, merchantType, personalPhone, pesaAiNumber, location, products } = draft;
  return { businessName, merchantType, personalPhone, pesaAiNumber, location, products: products || [] };
}

function details(input) {
  const businessName = String(input.businessName || "").trim();
  const personalPhone = db.normalizePhone(input.personalPhone);
  const pesaAiNumber = db.normalizePhone(input.pesaAiNumber);
  const merchantType = db.normalizeMerchantType(input.merchantType);
  const location = String(input.location || "").trim();
  if (!businessName || businessName.length > 120) throw db.httpError(400, "Enter a shop name of up to 120 characters.");
  if (!/^254[17]\d{8}$/.test(personalPhone) || !/^254[17]\d{8}$/.test(pesaAiNumber)) throw db.httpError(400, "Enter two valid Kenyan phone numbers.");
  if (personalPhone === pesaAiNumber) throw db.httpError(400, "Use different public and private phone numbers.");
  if (location.length > 160) throw db.httpError(400, "Location must be 160 characters or fewer.");
  return { businessName, personalPhone, pesaAiNumber, merchantType, location };
}

function productFields(input) {
  const name = String(input.name || "").trim();
  const description = String(input.description || "").trim();
  const price = Number(input.price);
  const stockQty = Number(input.stockQty ?? 0);
  if (!name || name.length > 140) throw db.httpError(400, "Enter a product name of up to 140 characters.");
  if (description.length > 500) throw db.httpError(400, "Description must be 500 characters or fewer.");
  if (input.price === "" || input.price == null || !Number.isFinite(price) || price < 0 || price > 100000000) throw db.httpError(400, "Enter a valid non-negative price.");
  if (!Number.isSafeInteger(stockQty) || stockQty < 0 || stockQty > 1000000) throw db.httpError(400, "Enter a valid non-negative stock quantity.");
  return { name, description, price, stockQty };
}

function start(input, token, req) {
  if (findDraft(db.load(), token)) return { draft: update(token, input), token: null };
  const validated = details(input);
  limitNewDrafts(req);
  const newToken = crypto.randomBytes(32).toString("hex");
  const draft = db.mutate((state) => {
    state.shopDrafts = (state.shopDrafts || []).filter((item) => !item.importedAt && new Date(item.expiresAt).getTime() > Date.now());
    if (state.shopDrafts.length >= 1000) throw db.httpError(503, "Setup is temporarily full. Please try again later.");
    const record = {
      id: db.id(),
      secretHash: crypto.createHash("sha256").update(newToken).digest("hex"),
      ...validated,
      products: [],
      createdAt: db.now(),
      updatedAt: db.now(),
      expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    };
    state.shopDrafts.push(record);
    return view(record);
  });
  return { draft, token: newToken };
}

function get(token) {
  return view(requireDraft(db.load(), token));
}

function update(token, input) {
  const validated = details(input);
  return db.mutate((state) => {
    const draft = requireDraft(state, token);
    Object.assign(draft, validated, { updatedAt: db.now() });
    return view(draft);
  });
}

function addProduct(token, input) {
  const validated = productFields(input);
  return db.mutate((state) => {
    const draft = requireDraft(state, token);
    if (draft.products.length >= 100) throw db.httpError(400, "A draft can hold up to 100 products.");
    draft.products.push({ id: db.id(), ...validated });
    draft.updatedAt = db.now();
    return view(draft);
  });
}

function changeProduct(token, productId, input) {
  const validated = productFields(input);
  return db.mutate((state) => {
    const draft = requireDraft(state, token);
    const product = draft.products.find((item) => item.id === productId);
    if (!product) throw db.httpError(404, "Draft product not found.");
    Object.assign(product, validated);
    draft.updatedAt = db.now();
    return view(draft);
  });
}

function removeProduct(token, productId) {
  return db.mutate((state) => {
    const draft = requireDraft(state, token);
    if (!draft.products.some((item) => item.id === productId)) throw db.httpError(404, "Draft product not found.");
    draft.products = draft.products.filter((item) => item.id !== productId);
    draft.updatedAt = db.now();
    return view(draft);
  });
}

function importForVerifiedSignup(state, token, pending, business) {
  const draft = findDraft(state, token);
  if (!draft ||
    draft.personalPhone !== pending.personalPhone ||
    draft.pesaAiNumber !== pending.pesaAiNumber ||
    draft.businessName.toLowerCase() !== pending.businessName.toLowerCase()) return false;
  business.location = draft.location || business.location;
  if (!Array.isArray(state.products)) state.products = [];
  for (const product of draft.products) {
    state.products.push({
      id: db.id(), businessId: business.id,
      name: product.name, description: product.description,
      price: product.price, stockQty: product.stockQty,
      imageUrl: null, source: "setup_draft", active: true, createdAt: db.now(),
    });
  }
  draft.importedAt = db.now();
  draft.importedBusinessId = business.id;
  return true;
}

module.exports = { cookie, tokenFromRequest, start, get, update, addProduct, changeProduct, removeProduct, importForVerifiedSignup };