// Tiny zero-dependency JSON-file "database".
//
// Why not Postgres/Prisma/SQLite from day one? This project needs to run
// with nothing but `node server.js` — no npm install, no native build step,
// no database server to stand up. That matters a lot for getting the MVP
// actually running today. The data access is isolated behind the functions
// below so swapping in a real database later (see README "Growing up from
// here") only touches this one file.
//
// Not safe for high concurrency / production scale — fine for one SME
// piloting the product end to end.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const fieldCrypto = require("./crypto");

// Override with a DATA_DIR env var to point this at a mounted persistent
// disk on hosts like Render/Railway (their filesystem is otherwise wiped
// on every deploy/restart, which would silently lose every business,
// order, and login). Defaults to a local folder for zero-setup local dev.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

function emptyState() {
  return {
    businesses: [],
    accounts: [],
    sessions: [],
    subscriptions: [],
    products: [],
    customers: [],
    conversations: [],
    messages: [],
    orders: [],
    reports: [],
  };
}

// Real 3-tier pricing. Plan `id` is what's actually stored on a
// subscription record (state.subscriptions[].plan) — `name` is just the
// display label. Also hardcoded as copy in public/landing.html,
// public/signup.html and public/dashboard.html's plan pickers — keep the
// prices/features here in sync with those if you change them (this file
// stays the source of truth for the actual billed amount either way).
const PLANS = {
  starter: {
    id: "starter",
    name: "Starter",
    priceKES: 2999,
    billingCycleDays: 30,
    features: ["WhatsApp AI", "Product catalogue", "Customer questions", "Orders", "Basic analytics"],
  },
  business: {
    id: "business",
    name: "Business",
    priceKES: 4999,
    billingCycleDays: 30,
    features: [
      "Everything in Starter",
      "AI sales agent",
      "Automated follow-ups",
      "M-Pesa integration",
      "Quotations",
      "Advanced analytics",
      "Multiple staff",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceKES: 9999,
    billingCycleDays: 30,
    features: [
      "Everything in Business",
      "Multiple WhatsApp numbers",
      "Advanced AI sales",
      "CRM",
      "Customer segmentation",
      "Business intelligence",
      "API integrations",
      "Priority support",
    ],
  },
};

const PLAN_ORDER = ["starter", "business", "pro"];
const DEFAULT_PLAN = "starter";
const TRIAL_DAYS = 14; // also hardcoded in public/landing.html's copy — keep in sync if you change it

function getPlan(planId) {
  return PLANS[planId] || PLANS[DEFAULT_PLAN];
}

// Not every line item in the pricing list above has a matching code gate —
// several (Quotations, Automated follow-ups, CRM, Customer segmentation,
// Business intelligence, API integrations, Multiple staff, Multiple
// WhatsApp numbers, Priority support) describe features that aren't built
// yet, so there's nothing in code to restrict. This map only covers the
// features that actually exist today and are enforced server-side.
const FEATURE_MIN_PLAN = {
  mpesa: "business",
  advancedAnalytics: "business",
};

function planMeetsMinimum(planId, minPlanId) {
  const a = PLAN_ORDER.indexOf(planId);
  const b = PLAN_ORDER.indexOf(minPlanId);
  if (a === -1 || b === -1) return false;
  return a >= b;
}

function planHasFeature(planId, featureKey) {
  const min = FEATURE_MIN_PLAN[featureKey];
  if (!min) return true;
  return planMeetsMinimum(planId, min);
}

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(emptyState(), null, 2));
  }
}

function load() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Corrupt data file at ${DATA_FILE}: ${err.message}`);
  }
}

// Deliberately synchronous. Node runs one request handler's synchronous
// code to completion before starting another's (nothing here `await`s),
// so a plain writeFileSync — with no queue — is already race-free: two
// mutate() calls can never interleave their read-modify-write. An earlier
// version used fs.writeFile (async, fire-and-forget) here and it caused a
// real bug: a mutate() could return before its write actually landed on
// disk, so an immediately-following load() in the next request read stale
// data. Keep this synchronous.
function save(state) {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

// --- generic helpers -------------------------------------------------

function mutate(fn) {
  const state = load();
  const result = fn(state);
  save(state);
  return result;
}

// --- Businesses --------------------------------------------------------

function titleCase(str) {
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function derivePersonaName(name, category) {
  const apostropheMatch = name.match(/^(.*?)['’]s\b/i);
  if (apostropheMatch) {
    return `${apostropheMatch[1]}'s ${titleCase(category)} AI`;
  }
  return `${name} AI`;
}

function createBusiness(
  state,
  { name, category, phone, paybillNumber, plan, buildingName, shopNumber, publicPhone, idOrKraPin }
) {
  if (state.businesses.some((b) => b.phone === phone)) {
    throw httpError(409, "A business with this phone number already exists");
  }

  const business = {
    id: id(),
    name,
    category,
    phone,
    personaName: derivePersonaName(name, category),
    paybillNumber: paybillNumber || null,
    whatsappPhoneNumberId: null, // set once they connect a real WhatsApp number
    whatsappVerifyToken: crypto.randomBytes(12).toString("hex"),

    // Optional physical-shop trust fields. All optional — a WhatsApp/
    // delivery-only business leaves these null. buildingName+shopNumber
    // can be shown to customers who ask "where are you?"; idOrKraPin is
    // NEVER shown publicly (stripped in sanitizeBusiness below) and
    // verifiedShop only ever flips true via manual admin review, not
    // just because these fields are filled in.
    buildingName: buildingName || null,
    shopNumber: shopNumber || null,
    publicPhone: publicPhone || null,
    idOrKraPin: idOrKraPin || null,
    verifiedShop: false,

    createdAt: now(),
  };
  state.businesses.push(business);

  const chosenPlan = PLANS[plan] ? plan : DEFAULT_PLAN;
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  state.subscriptions.push({
    businessId: business.id,
    plan: chosenPlan,
    priceKES: PLANS[chosenPlan].priceKES,
    status: "trialing",
    trialEndsAt,
    currentPeriodEnd: trialEndsAt,
    history: [],
    createdAt: now(),
    updatedAt: now(),
  });

  return business;
}

function listBusinesses() {
  return load().businesses;
}

function getBusiness(businessId) {
  const b = load().businesses.find((b) => b.id === businessId);
  if (!b) throw httpError(404, "Business not found");
  return b;
}

function getBusinessByWhatsappPhoneNumberId(phoneNumberId) {
  return load().businesses.find((b) => b.whatsappPhoneNumberId === phoneNumberId);
}

function updateBusiness(businessId, patch, actor) {
  return mutate((state) => {
    const b = state.businesses.find((b) => b.id === businessId);
    if (!b) throw httpError(404, "Business not found");
    Object.assign(b, patch);
    Object.keys(patch).forEach((field) => appendChangeLog(b, field, actor));
    return b;
  });
}

// Append-only audit trail on the business record itself — who changed
// what field and when. Deliberately records the field name and actor
// only, never the value (especially not for anything payment-related),
// so this is safe to eventually expose to the business owner as an
// activity log without itself becoming a new thing worth protecting.
// Bounded so it can't grow the data file forever.
function appendChangeLog(business, field, actor) {
  if (!business.changeLog) business.changeLog = [];
  business.changeLog.push({ field, changedBy: actor || null, at: now() });
  if (business.changeLog.length > 200) business.changeLog = business.changeLog.slice(-200);
}

// Shapes a business record for API responses — strips fields that should
// never leave the server (encrypted M-Pesa credential blobs, the raw
// audit log, the private ID/KRA PIN) and replaces them with the safe
// summary a client actually needs (connected yes/no, a masked shortcode
// to confirm "yes, that's the right paybill"). Every route that returns a
// business object should go through this rather than returning the raw db
// record.
function sanitizeBusiness(business) {
  if (!business) return business;
  const { mpesaCredentials, changeLog, idOrKraPin, ...rest } = business;
  return {
    ...rest,
    mpesaConnected: Boolean(mpesaCredentials),
    mpesaShortcodeMasked: mpesaCredentials ? fieldCrypto.maskShortcode(mpesaCredentials.shortcode) : null,
  };
}

// --- M-Pesa credentials (per-business, pass-through model) ---------------
//
// Each business connects their OWN Safaricom Daraja API app so customer
// order payments land straight in their own paybill — Pesa AI (Adplay
// Media Ltd) never collects or holds a business's sales revenue itself.
// That keeps this a "protect these credentials well" problem rather than
// a payment-aggregator problem (which would carry much heavier regulatory
// obligations). The Consumer Secret and Passkey are real API credentials,
// so they're encrypted at rest (see src/crypto.js) and never returned to
// the client once saved — only sanitizeBusiness()'s connected/masked
// summary is.

function setMpesaCredentials(businessId, { consumerKey, consumerSecret, passkey, shortcode }, actor) {
  return mutate((state) => {
    const business = state.businesses.find((b) => b.id === businessId);
    if (!business) throw httpError(404, "Business not found");
    business.mpesaCredentials = {
      consumerKeyEnc: fieldCrypto.encrypt(consumerKey),
      consumerSecretEnc: fieldCrypto.encrypt(consumerSecret),
      passkeyEnc: fieldCrypto.encrypt(passkey),
      shortcode: String(shortcode),
      updatedAt: now(),
    };
    appendChangeLog(business, "mpesaCredentials", actor);
    return { connected: true, shortcodeMasked: fieldCrypto.maskShortcode(shortcode) };
  });
}

function clearMpesaCredentials(businessId, actor) {
  return mutate((state) => {
    const business = state.businesses.find((b) => b.id === businessId);
    if (!business) throw httpError(404, "Business not found");
    business.mpesaCredentials = null;
    appendChangeLog(business, "mpesaCredentials", actor);
    return { connected: false };
  });
}

function getMpesaStatus(businessId) {
  const business = getBusiness(businessId);
  if (!business.mpesaCredentials) return { connected: false };
  return { connected: true, shortcodeMasked: fieldCrypto.maskShortcode(business.mpesaCredentials.shortcode) };
}

// Internal only — decrypts real credentials to actually call Daraja.
// Never expose the return value of this function over the API; only
// src/mpesa.js should call it.
function getMpesaCredentialsDecrypted(businessId) {
  const business = getBusiness(businessId);
  if (!business.mpesaCredentials) return null;
  const c = business.mpesaCredentials;
  return {
    consumerKey: fieldCrypto.decrypt(c.consumerKeyEnc),
    consumerSecret: fieldCrypto.decrypt(c.consumerSecretEnc),
    passkey: fieldCrypto.decrypt(c.passkeyEnc),
    shortcode: c.shortcode,
  };
}

// --- Accounts (login for a business owner) --------------------------------

function createAccount(state, { businessId, email, passwordHash, passwordSalt, consentedAt }) {
  const normalizedEmail = email.trim().toLowerCase();
  if (state.accounts.some((a) => a.email === normalizedEmail)) {
    throw httpError(409, "An account with this email already exists");
  }
  const account = {
    id: id(),
    businessId,
    email: normalizedEmail,
    passwordHash,
    passwordSalt,
    // When they agreed to the Privacy Policy at signup — demonstrable
    // proof of consent (DPA-relevant), not just a UI checkbox that leaves
    // no trace. Never null for accounts created after this field existed.
    consentedAt: consentedAt || null,
    createdAt: now(),
  };
  state.accounts.push(account);
  return account;
}

function getAccountByEmail(email) {
  return load().accounts.find((a) => a.email === email.trim().toLowerCase());
}

function getAccountById(accountId) {
  return load().accounts.find((a) => a.id === accountId);
}

// --- Sessions ------------------------------------------------------------

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_COOKIE_NAME = "pesaai_session";

function createSession({ accountId = null, businessId = null, isAdmin = false }) {
  return mutate((state) => {
    const session = {
      token: crypto.randomBytes(32).toString("hex"),
      accountId,
      businessId,
      isAdmin,
      createdAt: now(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };
    state.sessions.push(session);
    return session;
  });
}

function getSession(token) {
  if (!token) return null;
  const session = load().sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;
  return session;
}

function deleteSession(token) {
  mutate((state) => {
    const idx = state.sessions.findIndex((s) => s.token === token);
    if (idx !== -1) state.sessions.splice(idx, 1);
  });
}

// --- Subscriptions ---------------------------------------------------------

function getSubscription(businessId) {
  const state = load();
  let sub = state.subscriptions.find((s) => s.businessId === businessId);
  if (!sub) {
    // Businesses created before subscriptions existed (e.g. an older seed)
    // don't have one on disk yet — lazily create a trial so the billing
    // tab always has something sane to show.
    sub = mutate((state) => {
      const existing = state.subscriptions.find((s) => s.businessId === businessId);
      if (existing) return existing;
      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const created = {
        businessId,
        plan: DEFAULT_PLAN,
        priceKES: PLANS[DEFAULT_PLAN].priceKES,
        status: "trialing",
        trialEndsAt,
        currentPeriodEnd: trialEndsAt,
        history: [],
        createdAt: now(),
        updatedAt: now(),
      };
      state.subscriptions.push(created);
      return created;
    });
  }
  return effectiveSubscriptionStatus(sub);
}

// A trial/period "end" date is just data until something checks the clock
// against it — compute the live status here rather than relying on a
// background job to flip `status` when it lapses.
function effectiveSubscriptionStatus(sub) {
  const now = Date.now();
  if (sub.status === "trialing" && new Date(sub.trialEndsAt).getTime() < now) {
    return { ...sub, status: "trial_expired" };
  }
  if (sub.status === "active" && new Date(sub.currentPeriodEnd).getTime() < now) {
    return { ...sub, status: "past_due" };
  }
  return sub;
}

// Records a (simulated, for now) subscription payment and extends the
// billing period — see src/mpesa.js for why this doesn't call the real
// Daraja API yet.
function chargeSubscription(businessId, { amount, method = "mpesa-simulated", note } = {}) {
  return mutate((state) => {
    const sub = state.subscriptions.find((s) => s.businessId === businessId);
    if (!sub) throw httpError(404, "Subscription not found");
    const base = Math.max(Date.now(), new Date(sub.currentPeriodEnd).getTime());
    sub.status = "active";
    sub.currentPeriodEnd = new Date(base + getPlan(sub.plan).billingCycleDays * 24 * 60 * 60 * 1000).toISOString();
    sub.history.push({
      date: now(),
      amount: amount ?? sub.priceKES,
      method,
      note: note || null,
    });
    sub.updatedAt = now();
    return sub;
  });
}

// Switches a business to a different plan tier. Takes effect immediately
// (no proration) — the new priceKES is what the next charge bills. Logged
// to the business's audit trail the same way M-Pesa credential changes are.
function changeSubscriptionPlan(businessId, planId, actor) {
  if (!PLANS[planId]) throw httpError(400, "Unknown plan");
  return mutate((state) => {
    const business = state.businesses.find((b) => b.id === businessId);
    if (!business) throw httpError(404, "Business not found");
    const sub = state.subscriptions.find((s) => s.businessId === businessId);
    if (!sub) throw httpError(404, "Subscription not found");
    sub.plan = planId;
    sub.priceKES = PLANS[planId].priceKES;
    sub.updatedAt = now();
    appendChangeLog(business, "plan", actor);
    return sub;
  });
}

function listBusinessesWithSubscriptions() {
  const state = load();
  return state.businesses.map((b) => ({
    ...sanitizeBusiness(b),
    subscription: effectiveSubscriptionStatus(
      state.subscriptions.find((s) => s.businessId === b.id) || {
        businessId: b.id,
        plan: DEFAULT_PLAN,
        priceKES: PLANS[DEFAULT_PLAN].priceKES,
        status: "trialing",
        trialEndsAt: b.createdAt,
        currentPeriodEnd: b.createdAt,
        history: [],
      }
    ),
  }));
}

function suspendBusiness(businessId) {
  return mutate((state) => {
    const sub = state.subscriptions.find((s) => s.businessId === businessId);
    if (!sub) throw httpError(404, "Business subscription not found");
    sub.status = "suspended";
    return { ok: true };
  });
}

function unsuspendBusiness(businessId) {
  return mutate((state) => {
    const sub = state.subscriptions.find((s) => s.businessId === businessId);
    if (!sub) throw httpError(404, "Business subscription not found");
    sub.status = "active";
    return { ok: true };
  });
}

function getAdminStats() {
  const state = load();
  const nowMs = Date.now();
  let totalRevenue = 0;
  let revenueThisMonth = 0;
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  let activeCount = 0;
  let trialingCount = 0;
  let suspendedCount = 0;
  let whatsappConnected = 0;

  for (const b of state.businesses) {
    if (b.whatsappPhoneNumberId) whatsappConnected++;
    const sub = state.subscriptions.find((s) => s.businessId === b.id);
    if (sub) {
      const effective = effectiveSubscriptionStatus(sub);
      if (effective.status === "active") activeCount++;
      else if (effective.status === "trialing") trialingCount++;
      else if (effective.status === "suspended") suspendedCount++;
      for (const entry of sub.history || []) {
        totalRevenue += entry.amountKES || 0;
        if (new Date(entry.paidAt) >= startOfMonth) {
          revenueThisMonth += entry.amountKES || 0;
        }
      }
    }
  }

  const openReports = state.reports
    ? state.reports.filter((r) => r.status === "open").length
    : 0;

  return {
    totalBusinesses: state.businesses.length,
    activeBusinesses: activeCount,
    trialingBusinesses: trialingCount,
    suspendedBusinesses: suspendedCount,
    totalRevenue,
    revenueThisMonth,
    openReports,
    whatsappConnected,
  };
}

// --- Products ------------------------------------------------------------

function createProduct(businessId, { name, description, price, stockQty, imageUrl }) {
  return mutate((state) => {
    if (!state.businesses.some((b) => b.id === businessId)) {
      throw httpError(404, "Business not found");
    }
    const product = {
      id: id(),
      businessId,
      name,
      description: description || "",
      price: Number(price),
      stockQty: Number.isFinite(Number(stockQty)) ? Number(stockQty) : 0,
      imageUrl: imageUrl || null,
      active: true,
      createdAt: now(),
    };
    state.products.push(product);
    return product;
  });
}

// Bulk-creates products from parsed CSV/XLSX rows (client already parsed
// the file — this just validates + persists). Runs inside a single
// mutate() so either everything committed here lands together or, on an
// unexpected error, nothing does. Invalid rows are skipped individually
// (not fatal to the whole import) and returned so the caller can show the
// business owner exactly what was skipped and why.
function bulkCreateProducts(businessId, rows) {
  return mutate((state) => {
    if (!state.businesses.some((b) => b.id === businessId)) {
      throw httpError(404, "Business not found");
    }
    const created = [];
    const skipped = [];
    rows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const name = row && row.name !== undefined && row.name !== null ? String(row.name).trim() : "";
      if (!name) {
        skipped.push({ row: rowNum, reason: "missing name" });
        return;
      }
      const priceNum = Number(row.price);
      if (row.price === undefined || row.price === null || row.price === "" || Number.isNaN(priceNum) || priceNum < 0) {
        skipped.push({ row: rowNum, reason: "missing or invalid price" });
        return;
      }
      const stockQtyNum = Number(row.stockQty);
      const product = {
        id: id(),
        businessId,
        name,
        description: row.description !== undefined && row.description !== null ? String(row.description).trim() : "",
        price: priceNum,
        stockQty: Number.isFinite(stockQtyNum) && stockQtyNum >= 0 ? stockQtyNum : 0,
        imageUrl: row.imageUrl || null,
        active: true,
        createdAt: now(),
      };
      state.products.push(product);
      created.push(product);
    });
    return { created, skipped };
  });
}

function listProducts(businessId, { activeOnly = false } = {}) {
  const products = load().products.filter((p) => p.businessId === businessId);
  return activeOnly ? products.filter((p) => p.active) : products;
}

function getProduct(productId) {
  return load().products.find((p) => p.id === productId);
}

function updateProduct(businessId, productId, patch) {
  return mutate((state) => {
    const p = state.products.find((p) => p.id === productId && p.businessId === businessId);
    if (!p) throw httpError(404, "Product not found");
    Object.assign(p, patch);
    return p;
  });
}

function deleteProduct(businessId, productId) {
  return mutate((state) => {
    const idx = state.products.findIndex((p) => p.id === productId && p.businessId === businessId);
    if (idx === -1) throw httpError(404, "Product not found");
    state.products.splice(idx, 1);
  });
}

function decrementStock(state, productId, quantity) {
  const p = state.products.find((p) => p.id === productId);
  if (p) p.stockQty = Math.max(0, p.stockQty - quantity);
}

// --- Customers -------------------------------------------------------

function findOrCreateCustomer(state, businessId, phone, name) {
  let customer = state.customers.find((c) => c.businessId === businessId && c.phone === phone);
  if (!customer) {
    customer = { id: id(), businessId, phone, name: name || null, createdAt: now() };
    state.customers.push(customer);
  } else if (name && !customer.name) {
    customer.name = name;
  }
  return customer;
}

// --- Conversations & messages ------------------------------------------

function findOrCreateConversation(state, businessId, customerId, channel) {
  let convo = state.conversations.find(
    (c) => c.businessId === businessId && c.customerId === customerId
  );
  if (!convo) {
    convo = { id: id(), businessId, customerId, channel, createdAt: now() };
    state.conversations.push(convo);
  }
  return convo;
}

function addMessage(state, conversationId, role, content) {
  const message = { id: id(), conversationId, role, content, createdAt: now() };
  state.messages.push(message);
  return message;
}

function getConversationHistory(businessId, customerPhone, limit = 20) {
  const state = load();
  const customer = state.customers.find((c) => c.businessId === businessId && c.phone === customerPhone);
  if (!customer) return { customer: null, conversation: null, messages: [] };
  const convo = state.conversations.find((c) => c.businessId === businessId && c.customerId === customer.id);
  if (!convo) return { customer, conversation: null, messages: [] };
  const messages = state.messages
    .filter((m) => m.conversationId === convo.id)
    .slice(-limit);
  return { customer, conversation: convo, messages };
}

// --- Orders --------------------------------------------------------------

function createOrder(state, { businessId, customerId, items }) {
  // items: [{ productId, quantity }]
  const resolvedItems = items.map(({ productId, quantity }) => {
    const product = state.products.find((p) => p.id === productId && p.businessId === businessId);
    if (!product) throw httpError(400, `Unknown product: ${productId}`);
    return {
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice: product.price,
    };
  });
  const totalAmount = resolvedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const order = {
    id: id(),
    businessId,
    customerId,
    status: "pending",
    totalAmount,
    items: resolvedItems,
    createdAt: now(),
  };
  state.orders.push(order);
  resolvedItems.forEach((i) => decrementStock(state, i.productId, i.quantity));
  return order;
}

function listOrders(businessId) {
  const state = load();
  return state.orders
    .filter((o) => o.businessId === businessId)
    .map((o) => {
      const customer = state.customers.find((c) => c.id === o.customerId);
      return { ...o, customerPhone: customer ? customer.phone : null, customerName: customer ? customer.name : null };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getOrder(orderId) {
  return load().orders.find((o) => o.id === orderId);
}

function updateOrderStatus(orderId, status) {
  return mutate((state) => {
    const o = state.orders.find((o) => o.id === orderId);
    if (!o) throw httpError(404, "Order not found");
    o.status = status;
    return o;
  });
}

// Correlates a real Daraja STK push request to the order it was for, so
// that when Safaricom's asynchronous payment callback arrives (see
// /webhook/mpesa in server.js and src/mpesa.js's handleStkCallback), we
// know which order to mark paid — the callback only carries Safaricom's
// own CheckoutRequestID, not our order id.
function attachMpesaCheckoutRequest(orderId, checkoutRequestId) {
  return mutate((state) => {
    const o = state.orders.find((o) => o.id === orderId);
    if (!o) throw httpError(404, "Order not found");
    o.mpesaCheckoutRequestId = checkoutRequestId;
    return o;
  });
}

function getOrderByCheckoutRequestId(checkoutRequestId) {
  return load().orders.find((o) => o.mpesaCheckoutRequestId === checkoutRequestId);
}

// --- Sales analytics -------------------------------------------------

// Aggregates orders into the numbers a business owner actually wants to
// see: revenue/order counts (only counting orders that are actually paid
// for — "paid" or "fulfilled" — so a pile of abandoned "pending" orders
// doesn't inflate the headline number), top products by revenue, and a
// day-by-day trend for the requested window.
function getSalesSummary(businessId, { days = 14 } = {}) {
  const state = load();
  const orders = state.orders.filter((o) => o.businessId === businessId);
  const countedStatuses = ["paid", "fulfilled"];
  const countedOrders = orders.filter((o) => countedStatuses.includes(o.status));

  const totalRevenue = countedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const orderCount = countedOrders.length;
  const avgOrderValue = orderCount ? totalRevenue / orderCount : 0;
  const pendingOrderCount = orders.filter((o) => o.status === "pending" || o.status === "confirmed").length;

  const productTotals = new Map();
  countedOrders.forEach((o) => {
    o.items.forEach((item) => {
      const entry = productTotals.get(item.productId) || {
        productId: item.productId,
        productName: item.productName,
        quantity: 0,
        revenue: 0,
      };
      entry.quantity += item.quantity;
      entry.revenue += item.unitPrice * item.quantity;
      productTotals.set(item.productId, entry);
    });
  });
  const topProducts = [...productTotals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const trend = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(todayStart.getTime() - i * dayMs);
    const dayEnd = new Date(dayStart.getTime() + dayMs);
    const dayRevenue = countedOrders
      .filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      })
      .reduce((sum, o) => sum + o.totalAmount, 0);
    trend.push({ date: dayStart.toISOString().slice(0, 10), revenue: dayRevenue });
  }

  return { totalRevenue, orderCount, avgOrderValue, pendingOrderCount, topProducts, trend };
}

// --- Reports (report-a-business) ------------------------------------------
//
// Informational/moderation only — never touches payment flow. Filing a
// report does NOT suspend a business or affect its M-Pesa/paybill setup
// in any way; suspension stays a manual admin action taken elsewhere.

const REPORT_REASONS = ["scam", "no_delivery", "wrong_product", "other"];

function createReport(state, { businessId, reason, details, reporterContact }) {
  if (!REPORT_REASONS.includes(reason)) {
    throw httpError(400, "Invalid report reason");
  }
  const report = {
    id: id(),
    businessId,
    reason,
    details: details || "",
    reporterContact: reporterContact || null,
    status: "open", // "open" | "reviewed" | "dismissed" — admin sets this manually
    createdAt: now(),
  };
  state.reports.push(report);
  return report;
}

function getReportsGroupedByBusiness() {
  const state = load();
  const grouped = new Map();
  state.reports.forEach((r) => {
    if (!grouped.has(r.businessId)) grouped.set(r.businessId, []);
    grouped.get(r.businessId).push(r);
  });

  return [...grouped.entries()]
    .map(([businessId, reports]) => ({
      business: state.businesses.find((b) => b.id === businessId) || null,
      openCount: reports.filter((r) => r.status === "open").length,
      reports: reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    }))
    .sort((a, b) => b.openCount - a.openCount);
}

function updateReportStatus(reportId, status) {
  if (!["open", "reviewed", "dismissed"].includes(status)) {
    throw httpError(400, "Invalid report status");
  }
  return mutate((state) => {
    const report = state.reports.find((r) => r.id === reportId);
    if (!report) throw httpError(404, "Report not found");
    report.status = status;
    return report;
  });
}

// --- error helper --------------------------------------------------------

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = {
  load,
  mutate,
  id,
  now,
  httpError,
  PLANS,
  PLAN_ORDER,
  DEFAULT_PLAN,
  TRIAL_DAYS,
  getPlan,
  planHasFeature,
  SESSION_COOKIE_NAME,
  derivePersonaName,
  createBusiness,
  listBusinesses,
  getBusiness,
  getBusinessByWhatsappPhoneNumberId,
  updateBusiness,
  sanitizeBusiness,
  setMpesaCredentials,
  clearMpesaCredentials,
  getMpesaStatus,
  getMpesaCredentialsDecrypted,
  createAccount,
  getAccountByEmail,
  getAccountById,
  createSession,
  getSession,
  deleteSession,
  getSubscription,
  chargeSubscription,
  changeSubscriptionPlan,
  listBusinessesWithSubscriptions,
  createProduct,
  bulkCreateProducts,
  listProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  findOrCreateCustomer,
  findOrCreateConversation,
  addMessage,
  getConversationHistory,
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
  attachMpesaCheckoutRequest,
  getOrderByCheckoutRequestId,
  getSalesSummary,
  createReport,
  getReportsGroupedByBusiness,
  updateReportStatus,
  suspendBusiness,
  unsuspendBusiness,
  getAdminStats,
};
