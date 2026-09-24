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
const productImages = require("./product-images");
const { normalizeTranscript } = require("./transcriptNormalizer");

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
    otpChallenges: [],
    pendingSignups: [],
    shopDrafts: [],
    subscriptions: [],
    products: [],
    customers: [],
    conversations: [],
    messages: [],
    orders: [],
    reports: [],
    videoScans: [],
    stockMovements: [],
    mpesaTransactions: [],
    deniBook: [],
    sales: [],
    dailyReportRuns: [],
    knowledgeEntries: [],
    serviceLocations: [],
  };
}

// Real 3-tier pricing. Plan `id` is what's actually stored on a
// subscription record (state.subscriptions[].plan) — `name` is just the
// display label. Also hardcoded as copy in public/landing.html,
// public/signup.html and public/dashboard.html's plan pickers — keep the
// prices/features here in sync with those if you change them (this file
// stays the source of truth for the actual billed amount either way).
const PLANS = {
  free_trial: { id: "free_trial", name: "Free trial", priceKES: 0, billingCycleDays: 5, features: ["WhatsApp shop", "Product catalogue", "Customer questions", "Orders"] },
  starter: {
    id: "starter",
    name: "Starter",
    priceKES: 600,
    billingCycleDays: 30,
    features: ["WhatsApp AI", "Product catalogue", "Customer questions", "Orders", "Basic analytics"],
  },
  business: {
    id: "business",
    name: "Business",
    priceKES: 1000,
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
    priceKES: 1500,
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

const PLAN_ORDER = ["free_trial", "starter", "business", "pro"];
const DEFAULT_PLAN = "free_trial";
const TRIAL_DAYS = 5; // also hardcoded in public/landing.html's copy — keep in sync if you change it

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
    const state = JSON.parse(raw);
    // One-time, idempotent retirement of merchant-owned Daraja secrets.
    // Keep receiving details but never migrate old passkeys/OAuth into the
    // new Pesa SI app. Every merchant must be authorized again by admin.
    let changed = false;
    for (const business of state.businesses || []) {
      if (!business.mpesaCredentials) continue;
      const old = business.mpesaCredentials;
      const config = business.mpesa || {};
      const shortcode = String(config.shortcode || old.shortcode || "").trim();
      if (/^\d{5,10}$/.test(shortcode)) {
        const method = ["till", "paybill", "paybill_account"].includes(config.method) ? config.method : "paybill";
        business.mpesa = {
          method, shortcode,
          tillNumber: method === "till" ? shortcode : null,
          paybillNumber: method === "till" ? null : shortcode,
          accountNumber: config.accountNumber || null,
          accountMode: config.accountMode || "static",
          passkeyEnc: null, verified: false, enabled: false, updatedAt: now(),
        };
      } else business.mpesa = null;
      delete business.mpesaCredentials;
      changed = true;
    }
    if (changed) save(state);
    return state;
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
  // Mirror to Object Storage so data survives redeploys (non-blocking)
  try { require("./persistence").pushBackground(DATA_FILE); } catch (_) {}
}

// Raw state loader — used by whatsapp.js to check per-business verify tokens
// without going through the full sanitized API.
function loadRaw() {
  return load();
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

function runOneTimeSafeReset({ businessName, migrationId }) {
  return mutate((state) => {
    state.migrations = state.migrations && typeof state.migrations === "object"
      ? state.migrations
      : {};

    if (state.migrations[migrationId]) {
      return { applied: false, reason: "already-applied" };
    }

    const normalizedName = String(businessName || "").trim().toLowerCase();
    const matches = (state.businesses || []).filter(
      (business) => String(business.name || "").trim().toLowerCase() === normalizedName
    );
    if (matches.length !== 1) {
      throw new Error(`Safe reset expected exactly one business named "${businessName}", found ${matches.length}`);
    }

    const businessId = matches[0].id;
    const conversationIds = new Set(
      (state.conversations || [])
        .filter((conversation) => conversation.businessId === businessId)
        .map((conversation) => conversation.id)
    );
    const countForBusiness = (items) =>
      (Array.isArray(items) ? items : []).filter((item) => item.businessId === businessId).length;

    const removed = {
      customers: countForBusiness(state.customers),
      conversations: countForBusiness(state.conversations),
      messages: (state.messages || []).filter((message) => conversationIds.has(message.conversationId)).length,
      orders: countForBusiness(state.orders),
      reports: countForBusiness(state.reports),
      videoScans: countForBusiness(state.videoScans),
      stockMovements: countForBusiness(state.stockMovements),
    };

    state.customers = (state.customers || []).filter((item) => item.businessId !== businessId);
    state.conversations = (state.conversations || []).filter((item) => item.businessId !== businessId);
    state.messages = (state.messages || []).filter((item) => !conversationIds.has(item.conversationId));
    state.orders = (state.orders || []).filter((item) => item.businessId !== businessId);
    state.reports = (state.reports || []).filter((item) => item.businessId !== businessId);
    state.videoScans = (state.videoScans || []).filter((item) => item.businessId !== businessId);
    state.stockMovements = (state.stockMovements || []).filter((item) => item.businessId !== businessId);

    let productsReset = 0;
    for (const product of state.products || []) {
      if (product.businessId === businessId) {
        product.stockQty = 0;
        productsReset += 1;
      }
    }

    state.migrations[migrationId] = {
      appliedAt: now(),
      businessId,
      removed,
      productsReset,
    };
    return { applied: true, businessId, removed, productsReset };
  });
}

function restoreDeletedBusinessForSingleOrphanedAccount({ businessName, category }) {
  return mutate((state) => {
    const normalizedName = String(businessName || "").trim().toLowerCase();
    const existing = (state.businesses || []).find(
      (business) => String(business.name || "").trim().toLowerCase() === normalizedName
    );
    if (existing) return { restored: false, reason: "business-already-exists" };

    const businessIds = new Set((state.businesses || []).map((business) => business.id));
    const orphanedAccounts = (state.accounts || []).filter(
      (account) => !businessIds.has(account.businessId)
    );
    if (orphanedAccounts.length !== 1) {
      return {
        restored: false,
        reason: "ambiguous-orphaned-account",
        orphanedAccountCount: orphanedAccounts.length,
      };
    }

    const account = orphanedAccounts[0];
    const business = {
      id: account.businessId,
      name: businessName,
      category,
      phone: "",
      ownerName: null,
      personaName: derivePersonaName(businessName, category),
      personaInstructions: null,
      paymentMethod: null,
      mpesaType: null,
      bankName: null,
      bankAccountNumber: null,
      paybillNumber: null,
      paybillAccountNumber: null,
      whatsappPhoneNumberId: null,
      whatsappVerifyToken: crypto.randomBytes(12).toString("hex"),
      whatsappRequestedPhone: null,
      whatsappConnectionStatus: null,
      whatsappWabaId: null,
      whatsappDisplayName: null,
      buildingName: null,
      shopNumber: null,
      publicPhone: null,
      idOrKraPin: null,
      verifiedShop: false,
      location: null,
      deliveryAreas: null,
      welcomeMessage: null,
      createdAt: now(),
    };
    state.businesses.push(business);

    if (!(state.subscriptions || []).some((subscription) => subscription.businessId === business.id)) {
      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      state.subscriptions.push({
        businessId: business.id,
        plan: DEFAULT_PLAN,
        priceKES: PLANS[DEFAULT_PLAN].priceKES,
        status: "trialing",
        trialEndsAt,
        currentPeriodEnd: trialEndsAt,
        history: [],
        createdAt: now(),
        updatedAt: now(),
      });
    }

    return { restored: true, businessId: business.id };
  });
}

function repairSingleOrphanedAccount({ businessName }) {
  return mutate((state) => {
    const businessIds = new Set((state.businesses || []).map((business) => business.id));
    const orphanedAccounts = (state.accounts || []).filter(
      (account) => !businessIds.has(account.businessId)
    );
    const normalizedName = String(businessName || "").trim().toLowerCase();
    const businessMatches = (state.businesses || []).filter(
      (business) =>
        String(business.name || "").trim().toLowerCase() === normalizedName
    );

    if (orphanedAccounts.length === 0) {
      return { repaired: false, reason: "no-orphaned-accounts" };
    }
    if (orphanedAccounts.length !== 1 || businessMatches.length !== 1) {
      return {
        repaired: false,
        reason: "ambiguous-account-mapping",
        orphanedAccountCount: orphanedAccounts.length,
        matchingBusinessCount: businessMatches.length,
      };
    }

    const account = orphanedAccounts[0];
    const business = businessMatches[0];
    const previousBusinessId = account.businessId;
    account.businessId = business.id;
    for (const session of state.sessions || []) {
      if (session.accountId === account.id || session.businessId === previousBusinessId) {
        session.businessId = business.id;
      }
    }
    return { repaired: true, accountId: account.id, businessId: business.id };
  });
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

// ---------------------------------------------------------------------------
// Welcome message helpers
// ---------------------------------------------------------------------------

function getCategoryEmoji(category) {
  if (!category) return "🛍️";
  const c = category.toLowerCase();
  if (c.includes("fashion") || c.includes("cloth") || c.includes("apparel")) return "👗";
  if (c.includes("phone") || c.includes("mobile") || c.includes("accessory") || c.includes("accessories")) return "📱";
  if (c.includes("electronic") || c.includes("gadget") || c.includes("computer") || c.includes("laptop")) return "💻";
  if (c.includes("beauty") || c.includes("cosmet") || c.includes("skincare")) return "💄";
  if (c.includes("food") || c.includes("beverag") || c.includes("restaurant") || c.includes("grocery")) return "🍽️";
  if (c.includes("home") || c.includes("furnitur") || c.includes("interior")) return "🏠";
  if (c.includes("agricult") || c.includes("produce") || c.includes("farm")) return "🌾";
  if (c.includes("sport") || c.includes("fitness") || c.includes("gym")) return "🏋️";
  if (c.includes("health") || c.includes("pharma") || c.includes("medical")) return "🏥";
  return "🛍️";
}

function generateWelcomeMessage(business) {
  const emoji = getCategoryEmoji(business.category);
  const name = business.name || "Our Shop";

  // Build optional location/delivery lines
  const locationLine = business.location ? `\n📍 ${business.location}` : "";
  const deliveryLine = business.deliveryAreas ? `\n🚚 ${business.deliveryAreas}` : "";
  const extraLines = locationLine || deliveryLine ? `${locationLine}${deliveryLine}\n` : "";

  return (
    `👋 Welcome to ${name} WhatsApp Shop! ${emoji}📲\n` +
    `We're here to make shopping quick, easy & hassle-free. 😊\n` +
    `\n` +
    `💬 Tell us what you're looking for — we'll help you with:\n` +
    `• 📱 Products & prices\n` +
    `• 📦 Stock availability\n` +
    `• 🛒 How to place your order\n` +
    `• 📍 Delivery & location details\n` +
    (extraLines ? `\n${extraLines}` : `\n`) +
    `Ready to shop? Just tell us what you need and let's get started! 🚀\n` +
    `\n` +
    `WhatsApp. Shop. Sell. Grow. 🇰🇪💚`
  );
}

const MERCHANT_TYPES = new Set(["retail", "hospitality", "service", "other"]);

function normalizeMerchantType(value) {
  const type = String(value || "retail").toLowerCase();
  if (type === "hotel") return "hospitality";
  return MERCHANT_TYPES.has(type) ? type : "retail";
}

function createBusiness(
  state,
  { name, category, merchantType, phone, personalPhone, pesaAiNumber, paybillNumber, plan, buildingName, shopNumber, publicPhone, idOrKraPin, ownerName, personaInstructions, location, deliveryAreas }
) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedPersonalPhone = normalizePhone(personalPhone || phone);
  const normalizedShopNumber = pesaAiNumber ? normalizePhone(pesaAiNumber) : null;
  if (state.businesses.some((b) => normalizePhone(b.phone) === normalizedPhone)) {
    throw httpError(409, "A business with this phone number already exists");
  }
  if (normalizedShopNumber && state.businesses.some((b) => normalizePhone(b.pesaAiNumber) === normalizedShopNumber)) {
    throw httpError(409, "This public shop number is already registered to a Pesa SI shop");
  }

  const business = {
    id: id(),
    name,
    category,
    merchantType: normalizeMerchantType(merchantType),
    phone: normalizedPhone,
    personalPhone: normalizedPersonalPhone,
    personalPhoneVerified: false,
    pesaAiNumber: normalizedShopNumber,
    pesaAiNumberVerified: false,
    shopNumberStatus: "reserved",
    plan: DEFAULT_PLAN,
    ownerName: ownerName || null,
    personaName: derivePersonaName(name, category),
    personaInstructions: personaInstructions || null,
    paymentMethod: paybillNumber ? "mpesa" : null,
    mpesaType: paybillNumber ? "till" : null,
    bankName: null,
    bankAccountNumber: null,
    paybillNumber: paybillNumber || null,
    paybillAccountNumber: null,
    whatsappPhoneNumberId: null, // set by admin once Meta credentials are activated
    whatsappVerifyToken: crypto.randomBytes(12).toString("hex"),
    whatsappRequestedPhone: null, // vendor-submitted phone number awaiting admin connection
    whatsappWabaId: null,         // WhatsApp Business Account ID (set by admin)
    whatsappDisplayName: null,    // display name from Meta (set by admin)

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

    // Delivery & discovery
    location: location || null,           // e.g. "Nairobi CBD, Tom Mboya St"
    deliveryAreas: deliveryAreas || null, // e.g. "Nairobi & nationwide delivery"
    welcomeMessage: null,                 // auto-generated when WhatsApp connects

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
  business.trial_ends_at = trialEndsAt;

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
  const incomingId = String(phoneNumberId || "");
  const businesses = load().businesses || [];
  const exact = businesses.find((b) => String(b.whatsappPhoneNumberId || "") === incomingId);
  if (exact) return exact;

  // Self-heal routing for the platform number when persisted data still has
  // an older Meta test-number ID. Restrict the fallback to one unambiguous
  // business whose saved WhatsApp number matches the platform display number.
  const platformPhoneNumberId = String(process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || "1414909975031488");
  if (incomingId !== platformPhoneNumberId) return undefined;
  const platformPhone = normalizePhone(process.env.WHATSAPP_PLATFORM_DISPLAY_NUMBER || "254792717918");
  const matches = businesses.filter((b) => [b.whatsappNumber, b.whatsappRequestedPhone, b.pesaAiNumber, b.shopPhone].some((value) => normalizePhone(value) === platformPhone));
  return matches.length === 1 ? matches[0] : undefined;
}

function updateBusiness(businessId, patch, actor) {
  return mutate((state) => {
    const b = state.businesses.find((b) => b.id === businessId);
    if (!b) throw httpError(404, "Business not found");
    if (patch.paybillNumber !== undefined && patch.paymentMethod === "mpesa" &&
        String(patch.paybillNumber || "") !== String(b.mpesa?.shortcode || "")) {
      throw httpError(409, "Connect your Till or Paybill in Payments before saving M-Pesa details");
    }
    if (patch.paymentMethod === "bank" && b.mpesa) {
      b.mpesa.enabled = false;
      b.mpesa.verified = false;
      appendChangeLog(b, "mpesaDisabledForBank", actor);
    }
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
  const { mpesaCredentials, mpesa, changeLog, idOrKraPin, ...rest } = business;
  return {
    ...rest,
    mpesa: mpesa ? { method: mpesa.method, verified: mpesa.verified === true, enabled: mpesa.enabled === true } : null,
    merchantType: normalizeMerchantType(rest.merchantType),
    publicShopSlug: getPublicShopSlug(business),
    phone: maskPhone(rest.phone),
    personalPhone: maskPhone(rest.personalPhone),
    pesaAiNumber: maskPhone(rest.pesaAiNumber),
    publicPhone: maskPhone(rest.publicPhone),
    mpesaConnected: Boolean(mpesa?.shortcode),
    mpesaShortcodeMasked: fieldCrypto.maskShortcode(mpesa?.shortcode),
  };
}

// Pesa SI owns OAuth credentials. Each merchant owns a receiving shortcode.
// Safaricom issues the STK passkey for a specific shortcode; admins configure
// that authorization separately. No merchant can set or retrieve API secrets.
function setPlatformDaraja({ consumerKey, consumerSecret }) {
  if (!fieldCrypto.isConfigured()) throw httpError(503, "ENCRYPTION_KEY is required");
  if (!String(consumerKey || "").trim() || !String(consumerSecret || "").trim()) throw httpError(400, "Consumer Key and Consumer Secret are required");
  return mutate((state) => {
    state.platformDaraja = {
      consumerKeyEnc: fieldCrypto.encrypt(String(consumerKey).trim()),
      consumerSecretEnc: fieldCrypto.encrypt(String(consumerSecret).trim()),
      updatedAt: now(),
    };
    // Rotating the app requires re-checking every receiving account.
    for (const business of state.businesses) {
      if (business.mpesa) business.mpesa.verified = false;
    }
    return { configured: true, updatedAt: state.platformDaraja.updatedAt };
  });
}

function getPlatformDarajaStatus() {
  const config = load().platformDaraja;
  return { configured: Boolean(config?.consumerKeyEnc && config?.consumerSecretEnc), updatedAt: config?.updatedAt || null };
}

function getPlatformDarajaDecrypted() {
  const config = load().platformDaraja;
  if (!config?.consumerKeyEnc || !config?.consumerSecretEnc) return null;
  return { consumerKey: fieldCrypto.decrypt(config.consumerKeyEnc), consumerSecret: fieldCrypto.decrypt(config.consumerSecretEnc) };
}

function setMpesaReceivingAccount(businessId, { shortcode, method = "paybill", accountNumber = null, accountMode = "static" }, actor) {
  return mutate((state) => {
    const business = state.businesses.find((b) => b.id === businessId);
    if (!business) throw httpError(404, "Business not found");
    if (!["till", "paybill", "paybill_account"].includes(method)) throw httpError(400, "Invalid M-Pesa method");
    if (!["static", "dynamic_customer_phone"].includes(accountMode)) throw httpError(400, "Invalid M-Pesa account mode");
    const number = String(shortcode || "").trim();
    if (!/^\d{5,10}$/.test(number)) throw httpError(400, "Enter a valid Till or Paybill number (5–10 digits)");
    if (state.businesses.some((b) => b.id !== businessId && b.mpesa?.shortcode === number)) throw httpError(409, "This receiving number is already assigned to another merchant");
    if (method === "paybill_account" && accountMode === "static" && !String(accountNumber || "").trim()) throw httpError(400, "Account Number is required");
    const previous = business.mpesa || {};
    const sameShortcode = previous.shortcode === number && previous.method === method;
    business.mpesa = {
      method, shortcode: number, tillNumber: method === "till" ? number : null,
      paybillNumber: method === "till" ? null : number,
      accountNumber: method === "paybill_account" && accountMode === "static" ? String(accountNumber).trim() : null,
      accountMode, passkeyEnc: sameShortcode ? previous.passkeyEnc || null : null,
      enabled: false, verified: false, updatedAt: now(),
    };
    // Legacy merchant-owned OAuth credentials must not be used for new payments.
    business.mpesaCredentials = null;
    appendChangeLog(business, "mpesaReceivingAccount", actor);
    return getMpesaStatusFromBusiness(business);
  });
}

function setMerchantStkPasskey(businessId, passkey) {
  if (!fieldCrypto.isConfigured()) throw httpError(503, "ENCRYPTION_KEY is required");
  if (!String(passkey || "").trim()) throw httpError(400, "STK Passkey is required");
  return mutate((state) => {
    const business = state.businesses.find((b) => b.id === businessId);
    if (!business?.mpesa?.shortcode) throw httpError(404, "Merchant receiving details are missing");
    business.mpesa.passkeyEnc = fieldCrypto.encrypt(String(passkey).trim());
    business.mpesa.verified = false;
    business.mpesa.enabled = false;
    appendChangeLog(business, "mpesaStkPasskey", "admin");
    return { passkeyConfigured: true, verified: false };
  });
}

// --- WhatsApp Cloud API credentials (admin-only) --------------------------

// Vendor submits their WhatsApp Business phone number and waits for admin to activate
function requestWhatsAppConnection(businessId, phone) {
  return mutate((state) => {
    const b = state.businesses.find((b) => b.id === businessId);
    if (!b) throw httpError(404, "Business not found");
    b.whatsappRequestedPhone = phone || null;
    b.whatsappConnectionStatus = "requested";
    return { ok: true, requestedPhone: b.whatsappRequestedPhone, connectionStatus: b.whatsappConnectionStatus };
  });
}

// Admin activates a business's WhatsApp by setting Meta API credentials
function setWhatsAppConnectionStatus(businessId, status, error = null) {
  const allowed = ["requested", "connecting", "live", "failed"];
  if (!allowed.includes(status)) throw httpError(400, "Invalid WhatsApp connection status");
  return mutate((state) => {
    const business = state.businesses.find((item) => item.id === businessId);
    if (!business) throw httpError(404, "Business not found");
    business.whatsappConnectionStatus = status;
    business.whatsappConnectionError = error ? String(error).slice(0, 300) : null;
    return { connectionStatus: status, error: business.whatsappConnectionError };
  });
}

function setWhatsAppCredentials(businessId, { phoneNumberId, accessToken, verifyToken, wabaId, displayName, waPhone }) {
  return mutate((state) => {
    const b = state.businesses.find((b) => b.id === businessId);
    if (!b) throw httpError(404, "Business not found");
    if (phoneNumberId) {
      const duplicate = state.businesses.find((other) => other.id !== businessId && other.whatsappPhoneNumberId === phoneNumberId);
      if (duplicate) throw httpError(409, "This Meta Phone Number ID is already connected to another shop");
    }
    if (phoneNumberId !== undefined) b.whatsappPhoneNumberId = phoneNumberId || null;
    if (phoneNumberId && accessToken) b.shopNumberStatus = "meta_connected";
    if (verifyToken !== undefined) b.whatsappVerifyToken = verifyToken;
    if (wabaId !== undefined) b.whatsappWabaId = wabaId || null;
    if (displayName !== undefined) b.whatsappDisplayName = displayName || null;
    if (waPhone !== undefined) {
      b.whatsappRequestedPhone = waPhone || null;
      b.whatsappNumber = waPhone ? normalizePhone(waPhone) : null;
    }
    if (accessToken !== undefined) {
      b.whatsappAccessTokenEnc = accessToken ? fieldCrypto.encrypt(accessToken) : null;
    }
    // Auto-generate the customer welcome message on first connection
    const isNowConnected = !!(b.whatsappPhoneNumberId && b.whatsappAccessTokenEnc);
    b.whatsappConnectionStatus = isNowConnected ? "live" : (b.whatsappConnectionStatus || "connecting");
    if (isNowConnected && !b.welcomeMessage) {
      b.welcomeMessage = generateWelcomeMessage(b);
    }
    return { ok: true, connected: isNowConnected };
  });
}

// Admin view: full credentials status for a business
function getWhatsAppStatus(businessId) {
  const b = getBusiness(businessId);
  return {
    phoneNumberId: b.whatsappPhoneNumberId || null,
    verifyToken: b.whatsappVerifyToken || null,
    accessTokenSet: !!b.whatsappAccessTokenEnc,
    connected: b.whatsappConnectionStatus === "live" && !!(b.whatsappPhoneNumberId && b.whatsappAccessTokenEnc),
    connectionStatus: b.whatsappConnectionStatus || null,
    connectionError: b.whatsappConnectionError || null,
    requestedPhone: b.whatsappRequestedPhone || null,
    wabaId: b.whatsappWabaId || null,
    displayName: b.whatsappDisplayName || null,
  };
}

// Vendor view: only shows status safe for the business owner to see
function getVendorWhatsAppStatus(businessId) {
  const b = getBusiness(businessId);
  // A physical shop/unit number must never become a wa.me destination.
  const connectedPhone = b.whatsappNumber || b.whatsappRequestedPhone || b.pesaAiNumber || b.shopPhone || null;
  const digits = normalizePhone(connectedPhone);
  return {
    requestedPhone: connectedPhone,
    connectionStatus: b.whatsappConnectionStatus || null,
    connected: b.whatsappConnectionStatus === "live" && Boolean(b.whatsappPhoneNumberId && b.whatsappAccessTokenEnc),
    displayName: b.whatsappDisplayName || null,
    welcomeMessage: b.welcomeMessage || null,
    testShopUrl: digits ? "https://wa.me/" + digits + "?text=Hi%2C%20I%27d%20like%20to%20shop" : null,
  };
}

function clearMpesaCredentials(businessId, actor) {
  return mutate((state) => {
    const business = state.businesses.find((b) => b.id === businessId);
    if (!business) throw httpError(404, "Business not found");
    business.mpesaCredentials = null;
    business.mpesa = null;
    appendChangeLog(business, "mpesaCredentials", actor);
    return { connected: false };
  });
}

function getMpesaStatus(businessId) {
  return getMpesaStatusFromBusiness(getBusiness(businessId));
}

function getMpesaStatusFromBusiness(business) {
  const config = business.mpesa;
  return { connected: Boolean(config?.shortcode), verified: Boolean(config?.verified && config?.enabled && getPlatformDarajaStatus().configured), method: config?.method || null, accountMode: config?.accountMode || "static", shortcodeMasked: fieldCrypto.maskShortcode(config?.shortcode), passkeyConfigured: Boolean(config?.passkeyEnc), platformConfigured: getPlatformDarajaStatus().configured };
}

function verifyMpesaCredentials(businessId, actor) {
  return mutate((state) => {
    const business = state.businesses.find((item) => item.id === businessId);
    if (!business?.mpesa?.shortcode || !business.mpesa.passkeyEnc) throw httpError(409, "Receiving shortcode and its STK passkey are required");
    if (!state.platformDaraja?.consumerKeyEnc) throw httpError(409, "Pesa SI Daraja app is not configured");
    business.mpesa = { ...(business.mpesa || {}), enabled: true, verified: true, verifiedAt: now() };
    appendChangeLog(business, "mpesaReceivingAccountVerified", actor || "admin");
    return getMpesaStatusFromBusiness(business);
  });
}

function recordMpesaTransaction({ businessId, transactionId, orderId = null, amount = null, phone = null, method = null }) {
  const txId = String(transactionId || "").trim();
  if (!txId) throw httpError(400, "M-Pesa transaction ID is required");
  return mutate((state) => {
    state.mpesaTransactions = Array.isArray(state.mpesaTransactions) ? state.mpesaTransactions : [];
    const existing = state.mpesaTransactions.find((item) => item.transactionId === txId);
    if (existing) return { duplicate: true, transaction: existing };
    const transaction = { id: id(), businessId, transactionId: txId, orderId, amount, phone, method, createdAt: now() };
    state.mpesaTransactions.push(transaction);
    return { duplicate: false, transaction };
  });
}

// Internal only — decrypts real credentials to actually call Daraja.
// Never expose the return value of this function over the API; only
// src/mpesa.js should call it.
function getMpesaCredentialsDecrypted(businessId) {
  const business = getBusiness(businessId);
  const config = business.mpesa;
  const app = getPlatformDarajaDecrypted();
  if (!config?.shortcode || !config?.passkeyEnc || !app) return null;
  return {
    ...app,
    passkey: fieldCrypto.decrypt(config.passkeyEnc),
    shortcode: config.shortcode,
    verified: config.verified === true && config.enabled === true,
    method: config.method, tillNumber: config.tillNumber, paybillNumber: config.paybillNumber,
    accountNumber: config.accountNumber, accountMode: config.accountMode,
  };
}

// --- Accounts (login for a business owner) --------------------------------

function createAccount(state, { businessId, email = null, recoveryEmail = null, personalPhone = null, passwordHash = null, passwordSalt = null, consentedAt = null }) {
  const normalizedEmail = email ? email.trim().toLowerCase() : null;
  const normalizedRecoveryEmail = recoveryEmail ? recoveryEmail.trim().toLowerCase() : normalizedEmail;
  const normalizedPersonalPhone = personalPhone ? normalizePhone(personalPhone) : null;
  if (normalizedEmail && state.accounts.some((a) => a.email === normalizedEmail)) throw httpError(409, "An account with this email already exists");
  const account = { id: id(), businessId, email: normalizedEmail, recoveryEmail: normalizedRecoveryEmail, personalPhone: normalizedPersonalPhone, personalPhoneVerified: false, authMethod: normalizedPersonalPhone ? "phone_otp" : "legacy_email_password", passwordHash, passwordSalt, consentedAt, createdAt: now() };
  state.accounts.push(account);
  return account;
}

function getAccountByEmail(email) {
  if (!email) return undefined;
  return load().accounts.find((a) => a.email && a.email === email.trim().toLowerCase());
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  return digits;
}

function slugifyPublicShopName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "shop";
}

function getPublicShopSlug(business) {
  if (business?.publicShopSlug || business?.shopSlug) {
    return String(business.publicShopSlug || business.shopSlug);
  }
  const suffix = String(business?.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  return `${slugifyPublicShopName(business?.name)}${suffix ? `-${suffix}` : ""}`;
}

function hasExplicitPublicShopVisibility(business) {
  return ["publicShopPublished", "shopPublished", "published", "discoverable"]
    .some((field) => Object.prototype.hasOwnProperty.call(business || {}, field));
}

function isPublicShopDiscoverable(business) {
  if (!business || business.suspended === true || business.deletedAt) return false;
  const visibilityFields = ["publicShopPublished", "shopPublished", "published", "discoverable"];
  if (hasExplicitPublicShopVisibility(business)) {
    return visibilityFields.some((field) => business[field] === true);
  }

  // Existing businesses predate the explicit visibility field. A connected
  // WhatsApp number plus an intentionally supplied public number is the
  // legacy equivalent of publishing a shop; personal/business signup phones
  // are never enough to make a shop discoverable.
  const publicNumber = business.publicPhone || business.whatsappNumber ||
    business.whatsappRequestedPhone || business.pesaAiNumber || business.shopPhone;
  return Boolean(publicNumber && (
    business.whatsappPhoneNumberId ||
    business.whatsappConnectionStatus === "connected"
  ));
}

function publicShopPayload(business, { includeProducts = false } = {}) {
  const slug = getPublicShopSlug(business);
  const publicNumber = business.publicPhone || business.whatsappNumber ||
    business.whatsappRequestedPhone || business.pesaAiNumber || business.shopPhone || null;
  const payload = {
    name: business.name,
    category: business.category || null,
    location: business.location || null,
    deliveryAreas: business.deliveryAreas || null,
    buildingName: business.buildingName || null,
    shopNumber: business.shopNumber || null,
    verifiedShop: business.verifiedShop === true,
    logoUrl: business.logoUrl || business.logo || null,
    imageUrl: business.imageUrl || business.shopImageUrl || null,
    businessId: business.id,
    slug,
    url: `/shop/${encodeURIComponent(slug)}`,
    whatsappUrl: publicNumber
      ? `https://wa.me/${normalizePhone(publicNumber)}?text=${encodeURIComponent(`Hi ${slug}`)}`
      : null,
  };
  if (includeProducts) {
    payload.popularProducts = listProducts(business.id, { activeOnly: true })
      .filter((product) => Number(product.stockQty) > 0)
      .slice(0, 3)
      .map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      stockQty: product.stockQty,
    }));
  }
  return payload;
}

function searchPublicShopsByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  return load().businesses
    .filter((business) => isPublicShopDiscoverable(business))
    .filter((business) => {
      const publicNumbers = [
        business.publicPhone,
        business.whatsappNumber,
        business.whatsappRequestedPhone,
        business.pesaAiNumber,
        business.shopPhone,
      ].filter(Boolean);
      return publicNumbers.some((candidate) => normalizePhone(candidate) === normalized);
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .map((business) => publicShopPayload(business));
}

function getPublicShopBySlug(slug) {
  const normalizedSlug = String(slug || "").trim().toLowerCase();
  if (!normalizedSlug) return undefined;
  const publicBusinesses = load().businesses.filter(isPublicShopDiscoverable);
  const exact = publicBusinesses.find((candidate) =>
    getPublicShopSlug(candidate).toLowerCase() === normalizedSlug
  );
  // QR cards generated before the persisted slug was available used the
  // readable name-only path. Keep that path working only when it is
  // unambiguous; duplicate shop names must use the collision-safe slug.
  const nameMatches = publicBusinesses.filter((candidate) =>
    slugifyPublicShopName(candidate.name) === normalizedSlug
  );
  const business = exact || (nameMatches.length === 1 ? nameMatches[0] : undefined);
  return business ? publicShopPayload(business, { includeProducts: true }) : undefined;
}

function normalizeProductSearchText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchPublicProducts(businessId, query, { limit = 12 } = {}) {
  const business = load().businesses.find((candidate) =>
    candidate.id === businessId && isPublicShopDiscoverable(candidate)
  );
  if (!business) return [];
  const tokens = normalizeProductSearchText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  const maxResults = Math.min(Math.max(Number(limit) || 12, 1), 24);
  const results = [];
  for (const product of listProducts(business.id, { activeOnly: true })) {
    const variants = Array.isArray(product.colorStock) && product.colorStock.length
      ? product.colorStock
      : [{ color: null, quantity: product.stockQty, imageUrl: product.imageUrl || null }];
    for (const variant of variants) {
      const variantName = variant.color ? String(variant.color) : "";
      const searchable = normalizeProductSearchText(
        `${product.name || ""} ${product.description || ""} ${variantName}`
      );
      if (!tokens.every((token) => searchable.includes(token))) continue;
      const imageUrl = variant.imageUrl || product.imageUrl || null;
      // Public search is intentionally photo-on-demand: do not return a
      // catalogue match unless the requested variant already has an image.
      if (!imageUrl) continue;
      results.push({
        id: `${product.id}:${variantName || "default"}`,
        productId: product.id,
        productName: product.name,
        variant: variantName || null,
        price: Number(product.price) || 0,
        stockQty: Number(variant.quantity) || 0,
        imageUrl,
      });
      if (results.length >= maxResults) return results;
    }
  }
  return results;
}

function maskEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) return null;
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return null;
  return local.slice(0, 2) + "****@" + domain;
}

function maskPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return normalized.length > 6 ? normalized.slice(0, 4) + "***" + normalized.slice(-3) : "***";
}

function getAccountByPersonalPhone(phone) {
  const normalized = normalizePhone(phone);
  const state = load();
  const direct = (state.accounts || []).find((a) => normalizePhone(a.personalPhone) === normalized);
  if (direct) return direct;
  const business = (state.businesses || []).find((b) => normalizePhone(b.personalPhone || b.phone) === normalized);
  return business ? state.accounts.find((a) => a.businessId === business.id) : undefined;
}

function otpChannelForPurpose(purpose) {
  return purpose === "signup_shop" ? "sms" : "whatsapp";
}

function createOtpChallenge(phone, purpose = "login", metadata = {}, channel = null) {
  return mutate((state) => {
    if (!Array.isArray(state.otpChallenges)) state.otpChallenges = [];
    const normalizedPhone = normalizePhone(phone);
    const resolvedChannel = channel || otpChannelForPurpose(purpose);
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const recent = state.otpChallenges.filter((item) => item.phone === normalizedPhone && item.channel === resolvedChannel && new Date(item.createdAt).getTime() > hourAgo);
    if (recent.length >= 3) throw httpError(429, "Too many codes requested. Try again later.");
    const code = String(crypto.randomInt(100000, 1000000));
    const challenge = { id: id(), phone: normalizedPhone, channel: resolvedChannel, purpose, metadata, codeHash: crypto.createHash("sha256").update(code).digest("hex"), expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), used: false, usedAt: null, attempts: 0, createdAt: now() };
    state.otpChallenges.push(challenge);
    return { phone: normalizedPhone, code, expiresAt: challenge.expiresAt, channel: resolvedChannel };
  });
}

function verifyOtpChallenge(phone, code, purpose = "login", pendingSignupId = null) {
  const result = mutate((state) => {
    const normalizedPhone = normalizePhone(phone);
    const channel = otpChannelForPurpose(purpose);
    if (purpose.startsWith("signup_") && !pendingSignupId) throw httpError(400, "Signup verification requires a pending signup.");
    const challenge = (state.otpChallenges || []).slice().reverse().find((item) =>
      item.phone === normalizedPhone && item.purpose === purpose && item.channel === channel &&
      (!pendingSignupId || item.metadata?.pendingSignupId === pendingSignupId)
    );
    if (!challenge || challenge.used || new Date(challenge.expiresAt).getTime() < Date.now()) throw httpError(400, "This code has expired. Request a new one.");
    if (challenge.attempts >= 5) throw httpError(429, "Too many attempts. Request a new code.");
    const candidateHash = crypto.createHash("sha256").update(String(code || "")).digest("hex");
    if (candidateHash !== challenge.codeHash) {
      challenge.attempts += 1;
      return { error: httpError(challenge.attempts >= 5 ? 429 : 400, challenge.attempts >= 5 ? "Too many attempts. Request a new code." : "That code is not correct.") };
    }
    challenge.used = true;
    challenge.usedAt = now();
    return { verified: true };
  });
  if (result.error) throw result.error;
  return true;
}

function invalidateSignupChallenges(state, pendingId) {
  for (const challenge of state.otpChallenges || []) {
    if (challenge.metadata?.pendingSignupId === pendingId && !challenge.used) {
      challenge.used = true;
      challenge.usedAt = now();
    }
  }
}

function createPendingSignup(state, { businessName, personalPhone, pesaAiNumber, merchantType }) {
  const normalizedPersonalPhone = normalizePhone(personalPhone);
  const normalizedShopNumber = normalizePhone(pesaAiNumber);
  const normalizedName = String(businessName).trim();
  const normalizedMerchantType = normalizeMerchantType(merchantType);
  if (normalizedPersonalPhone && normalizedPersonalPhone === normalizedShopNumber) throw httpError(400, "Use two different numbers: one public Duka number and one private number for alerts.");
  if ((state.businesses || []).some((b) => normalizePhone(b.pesaAiNumber) === normalizedShopNumber)) throw httpError(409, "This public shop number is already registered to a Pesa SI shop");
  const currentTime = Date.now();
  const existing = (state.pendingSignups || []).find((p) => p.pesaAiNumber === normalizedShopNumber && !p.finalizedAt && new Date(p.expiresAt).getTime() > currentTime);
  if (existing) {
    if (existing.personalPhone !== normalizedPersonalPhone || existing.businessName.toLowerCase() !== normalizedName.toLowerCase() || existing.merchantType !== normalizedMerchantType) {
      throw httpError(409, "This number is already being verified with different signup details. Use the original details or wait for verification to expire.");
    }
    return existing;
  }
  const pending = { id: id(), businessName: normalizedName, merchantType: normalizedMerchantType, personalPhone: normalizedPersonalPhone, pesaAiNumber: normalizedShopNumber, personalVerified: false, shopVerified: false, status: "pending_verification", createdAt: now(), expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() };
  if (!Array.isArray(state.pendingSignups)) state.pendingSignups = [];
  state.pendingSignups.push(pending);
  return pending;
}

function getPendingSignup(pendingId) {
  return (load().pendingSignups || []).find((item) => item.id === pendingId);
}

function cancelPendingSignup(pendingId) {
  return mutate((state) => {
    state.pendingSignups = (state.pendingSignups || []).filter((item) => item.id !== pendingId);
    invalidateSignupChallenges(state, pendingId);
    return true;
  });
}

function markPendingSignupChannelVerified(pendingId, channel) {
  return mutate((state) => {
    const pending = (state.pendingSignups || []).find((item) => item.id === pendingId);
    if (!pending || new Date(pending.expiresAt).getTime() < Date.now()) throw httpError(400, "This signup has expired. Please start again.");
    if (channel === "personal") pending.personalVerified = true;
    if (channel === "shop") pending.shopVerified = true;
    return pending;
  });
}

function finalizePendingSignup(pendingId, { draftToken = null } = {}) {
  return mutate((state) => {
    const pending = (state.pendingSignups || []).find((item) => item.id === pendingId);
    if (!pending || !pending.personalVerified || !pending.shopVerified) throw httpError(400, "Both phone numbers must be verified first");
    if (pending.finalizedAt) throw httpError(409, "This signup has already been completed");
    const business = createBusiness(state, { name: pending.businessName, category: null, merchantType: pending.merchantType, phone: pending.personalPhone, personalPhone: pending.personalPhone, pesaAiNumber: pending.pesaAiNumber, plan: "free_trial" });
    business.personalPhoneVerified = true;
    business.pesaAiNumberVerified = true;
    business.shopNumberStatus = "sms_verified";
    business.shopNumberVerificationStatus = "verified";
    const account = createAccount(state, { businessId: business.id, personalPhone: pending.personalPhone });
    account.personalPhoneVerified = true;
    if (draftToken) require("./setup-drafts").importForVerifiedSignup(state, draftToken, pending, business);
    pending.finalizedAt = now();
    pending.status = "verified";
    return { business, account };
  });
}

function markPersonalPhoneVerified(businessId) {
  return mutate((state) => {
    const business = state.businesses.find((item) => item.id === businessId);
    if (!business) throw httpError(404, "Business not found");
    business.personalPhoneVerified = true;
    const account = state.accounts.find((item) => item.businessId === businessId);
    if (account) { account.personalPhone = account.personalPhone || business.personalPhone; account.personalPhoneVerified = true; account.authMethod = "phone_otp"; }
    return business;
  });
}

function getAccountById(accountId) {
  return load().accounts.find((a) => a.id === accountId);
}

function resetAccountPasswordByBusinessId(businessId, passwordHash, passwordSalt) {
  return mutate((state) => {
    const idx = state.accounts.findIndex((a) => a.businessId === businessId);
    if (idx === -1) throw httpError(404, "No account found for this business");
    state.accounts[idx].passwordHash = passwordHash;
    state.accounts[idx].passwordSalt = passwordSalt;
    return { ok: true };
  });
}

// --- Sessions ------------------------------------------------------------

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_COOKIE_NAME = "pesaai_session";

function updateAccountRecoveryEmail(accountId, recoveryEmail) {
  return mutate((state) => {
    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) throw httpError(404, "Account not found");
    account.recoveryEmail = recoveryEmail || null;
    return account;
  });
}

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

function getAdminGrowthSummary({ days = 30 } = {}) {
  const state = load();
  const boundedDays = Math.min(Math.max(Math.round(Number(days) || 30), 1), 90);
  const periodStart = Date.now() - boundedDays * 24 * 60 * 60 * 1000;
  const businesses = state.businesses || [];
  const businessById = new Map(businesses.map((business) => [business.id, business]));
  const conversations = state.conversations || [];
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const activityByBusiness = new Map();
  const messageCountByBusiness = new Map();
  const conversationIdsByBusiness = new Map();

  const addActivity = (businessId, timestamp, messageCount = 0) => {
    if (!businessId) return;
    if (!activityByBusiness.has(businessId)) activityByBusiness.set(businessId, true);
    messageCountByBusiness.set(businessId, (messageCountByBusiness.get(businessId) || 0) + messageCount);
  };

  for (const message of state.messages || []) {
    const createdAt = new Date(message.createdAt || 0).getTime();
    if (message.role !== "customer" || !Number.isFinite(createdAt) || createdAt < periodStart) continue;
    const conversation = conversationById.get(message.conversationId);
    if (!conversation) continue;
    addActivity(conversation.businessId, createdAt, 1);
    if (!conversationIdsByBusiness.has(conversation.businessId)) conversationIdsByBusiness.set(conversation.businessId, new Set());
    conversationIdsByBusiness.get(conversation.businessId).add(conversation.id);
  }

  const ordersInPeriod = (state.orders || []).filter((order) => {
    const createdAt = new Date(order.createdAt || 0).getTime();
    return Number.isFinite(createdAt) && createdAt >= periodStart;
  });
  const paidOrdersInPeriod = (state.orders || []).filter((order) => {
    const paidAt = new Date(
      (order.paymentMeta && order.paymentMeta.paidAt) || order.updatedAt || order.createdAt || 0
    ).getTime();
    return ["paid", "fulfilled"].includes(order.status) && Number.isFinite(paidAt) && paidAt >= periodStart;
  });
  const pendingOrdersInPeriod = ordersInPeriod.filter((order) =>
    ["pending", "confirmed"].includes(order.status)
  );

  for (const order of ordersInPeriod) addActivity(order.businessId, order.createdAt);
  for (const order of paidOrdersInPeriod) addActivity(order.businessId, order.updatedAt || order.createdAt);

  const sumOrderValue = (orders) => orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const totalTransactionValue = sumOrderValue(paidOrdersInPeriod);
  const mpesaOrders = paidOrdersInPeriod.filter((order) =>
    String((order.paymentMeta && order.paymentMeta.paymentMethod) || order.paymentMethod || "").toLowerCase().startsWith("mpesa")
  );
  const mpesaValue = sumOrderValue(mpesaOrders);
  const activeBusinessIds = new Set(activityByBusiness.keys());
  const businessesWithOrders = new Set(ordersInPeriod.map((order) => order.businessId));
  const businessesWithPaidOrders = new Set(paidOrdersInPeriod.map((order) => order.businessId));

  const merchants = businesses
    .map((business) => {
      const businessOrders = ordersInPeriod.filter((order) => order.businessId === business.id);
      const businessPaidOrders = paidOrdersInPeriod.filter((order) => order.businessId === business.id);
      const transactionValue = sumOrderValue(businessPaidOrders);
      const customerMessages = messageCountByBusiness.get(business.id) || 0;
      const conversationsCount = conversationIdsByBusiness.get(business.id)?.size || 0;
      return {
        id: business.id,
        name: business.name,
        plan: (state.subscriptions || []).find((subscription) => subscription.businessId === business.id)?.plan || "free_trial",
        whatsappConnected: Boolean(business.whatsappPhoneNumberId),
        active: activeBusinessIds.has(business.id),
        customerMessages,
        conversations: conversationsCount,
        orders: businessOrders.length,
        paidOrders: businessPaidOrders.length,
        transactionValue,
        mpesaValue: sumOrderValue(businessPaidOrders.filter((order) =>
          String((order.paymentMeta && order.paymentMeta.paymentMethod) || order.paymentMethod || "").toLowerCase().startsWith("mpesa")
        )),
      };
    })
    .sort((a, b) => b.transactionValue - a.transactionValue || b.customerMessages - a.customerMessages)
    .slice(0, 10);

  const toDateKey = (value) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(value));
  const trend = [];
  for (let index = boundedDays - 1; index >= 0; index--) {
    const timestamp = Date.now() - index * 24 * 60 * 60 * 1000;
    const date = toDateKey(timestamp);
    const dayOrders = ordersInPeriod.filter((order) => toDateKey(order.createdAt) === date);
    const dayPaidOrders = paidOrdersInPeriod.filter((order) =>
      toDateKey((order.paymentMeta && order.paymentMeta.paidAt) || order.updatedAt || order.createdAt) === date
    );
    const dayMessages = (state.messages || []).filter((message) => {
      if (message.role !== "customer" || toDateKey(message.createdAt) !== date) return false;
      const conversation = conversationById.get(message.conversationId);
      return Boolean(conversation && businessById.has(conversation.businessId));
    });
    trend.push({
      date,
      activeMerchants: new Set([
        ...dayMessages.map((message) => conversationById.get(message.conversationId)?.businessId),
        ...dayOrders.map((order) => order.businessId),
        ...dayPaidOrders.map((order) => order.businessId),
      ].filter(Boolean)).size,
      customerMessages: dayMessages.length,
      orders: dayOrders.length,
      paidOrders: dayPaidOrders.length,
      transactionValue: sumOrderValue(dayPaidOrders),
    });
  }

  const connectedCount = businesses.filter((business) => business.whatsappPhoneNumberId).length;
  const activeCount = activeBusinessIds.size;
  const averageOrderValue = paidOrdersInPeriod.length ? totalTransactionValue / paidOrdersInPeriod.length : 0;
  const recommendations = [];
  const addRecommendation = (priority, title, detail) => recommendations.push({ priority, title, detail });

  if (connectedCount > activeCount) {
    addRecommendation(
      "high",
      "Activate connected merchants",
      `${connectedCount - activeCount} connected merchant${connectedCount - activeCount === 1 ? "" : "s"} had no customer activity in this period. Focus onboarding on their first shop link, catalogue, and test order.`
    );
  }
  if (activeCount > 0 && paidOrdersInPeriod.length === 0) {
    addRecommendation("high", "Turn conversations into paid orders", "Merchants are receiving customer activity but no paid orders were recorded. Review catalogue clarity, checkout prompts, and M-Pesa setup.");
  } else if (ordersInPeriod.length > paidOrdersInPeriod.length * 2 && ordersInPeriod.length > 0) {
    addRecommendation("medium", "Reduce order drop-off", `${ordersInPeriod.length - paidOrdersInPeriod.length} orders were not paid or fulfilled in this period. Follow up on payment prompts and merchant fulfilment response time.`);
  }
  if (pendingOrdersInPeriod.length > 0) {
    addRecommendation("medium", "Clear the pending queue", `${pendingOrdersInPeriod.length} recent orders are still pending or confirmed. A faster merchant response can improve customer trust and conversion.`);
  }
  if (totalTransactionValue > 0 && merchants[0] && merchants[0].transactionValue / totalTransactionValue > 0.7) {
    addRecommendation("medium", "Reduce revenue concentration", `${merchants[0].name} contributes more than 70% of tracked transaction value. Replicate that merchant's onboarding and catalogue practices across the next best prospects.`);
  }
  if (!recommendations.length) {
    addRecommendation("low", "Scale what is working", "Usage and paid orders are active across the platform. Double down on the highest-performing merchant's catalogue, WhatsApp setup, and customer acquisition pattern.");
  }

  return {
    periodDays: boundedDays,
    periodStart: new Date(periodStart).toISOString(),
    totalBusinesses: businesses.length,
    connectedMerchants: connectedCount,
    activeMerchants: activeCount,
    merchantsWithOrders: businessesWithOrders.size,
    merchantsWithPaidOrders: businessesWithPaidOrders.size,
    usageRate: businesses.length ? (activeCount / businesses.length) * 100 : 0,
    customerMessages: [...messageCountByBusiness.values()].reduce((sum, count) => sum + count, 0),
    customerConversations: new Set([...conversationIdsByBusiness.values()].flatMap((ids) => [...ids])).size,
    orders: ordersInPeriod.length,
    paidOrders: paidOrdersInPeriod.length,
    pendingOrders: pendingOrdersInPeriod.length,
    totalTransactionValue,
    mpesaValue,
    mpesaTransactions: mpesaOrders.length,
    averageOrderValue,
    trend,
    merchants,
    recommendations,
  };
}

// --- Products ------------------------------------------------------------

function createProduct(businessId, { name, description, price, stockQty, imageUrl, source }) {
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
      source: source || null,
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
        source: row.source || null,
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

// --- Voice stock movements -------------------------------------------------

function ensureStockMovements(state) {
  // Older database files predate stock movements. Keep this migration lazy so
  // they remain readable without a separate migration command.
  if (!Array.isArray(state.stockMovements)) state.stockMovements = [];
  return state.stockMovements;
}

function normalizeVoiceProductName(value) {
  return normalizeTranscript(value).replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function confirmStockMovements(businessId, items, { transcript, rawTranscript, parserVersion = "v2.1", accountId, requestId, clientRequestId } = {}) {
  return mutate((state) => {
    if (!state.businesses.some((business) => business.id === businessId)) throw httpError(404, "Business not found");
    ensureStockMovements(state);
    const normalizedRequestId = String(clientRequestId ?? requestId ?? "").trim() || null;
    if (normalizedRequestId && normalizedRequestId.length > 100) throw httpError(400, "Request ID must be at most 100 characters");
    const auditTranscript = rawTranscript == null ? (transcript == null ? null : String(transcript)) : String(rawTranscript);
    if (normalizedRequestId) {
      const previous = state.stockMovements.filter((movement) => movement.businessId === businessId && (movement.clientRequestId || movement.requestId) === normalizedRequestId);
      if (previous.length) {
        const productIds = [...new Set(previous.map((movement) => movement.productId))];
        return { products: state.products.filter((product) => product.businessId === businessId && productIds.includes(product.id)), movements: previous, duplicate: true, idempotent: true };
      }
    }
    const products = [];
    const movements = [];
    const stagedStock = new Map();
    const stagedColors = new Map();
    for (const item of items) {
      const requestedProductId = item.productId == null || String(item.productId).trim() === "" ? null : String(item.productId).trim();
      let product = requestedProductId ? state.products.find((p) => p.id === requestedProductId && p.businessId === businessId) : null;
      if (requestedProductId && !product) throw httpError(400, "Product does not belong to this business");
      if (!product) {
        const requestedName = String(item.productName || "").trim();
        if (requestedName.length < 3 || requestedName.length > 200) throw httpError(400, "Product name must be between 3 and 200 characters");
        const normalizedName = normalizeVoiceProductName(requestedName);
        product = state.products.find((candidate) => candidate.businessId === businessId && normalizeVoiceProductName(candidate.name) === normalizedName);
        if (!product) {
          product = { id: id(), businessId, name: requestedName, description: "", price: 0, stockQty: 0, imageUrl: null, source: "voice-stock", active: true, createdAt: now() };
          state.products.push(product);
        }
      }
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw httpError(400, "Each movement quantity must be between 1 and 100000");
      if (!["receive", "sell", "damage", "missing", "adjustment"].includes(item.action)) throw httpError(400, "Invalid stock movement action");
      if (item.unit != null && String(item.unit).length > 50) throw httpError(400, "Movement unit must be at most 50 characters");
      const requestedColor = item.color == null ? "" : String(item.color).trim();
      const requestedSize = item.size == null ? "" : String(item.size).trim();
      const imageUrl = item.imageUrl == null ? "" : String(item.imageUrl).trim();
      if (requestedColor.length > 50) throw httpError(400, "Colour must be at most 50 characters");
      if (item.color != null && !requestedColor) throw httpError(400, "Colour cannot be blank");
      if (requestedSize.length > 50) throw httpError(400, "Size must be at most 50 characters");
      if (imageUrl.length > 500) throw httpError(400, "Product image URL must be at most 500 characters");
      if (imageUrl && productImages.isConfigured() && !productImages.isPublicProductImageUrl(imageUrl)) throw httpError(400, "Product image URL must come from configured Supabase product storage");
      const existingColors = stagedColors.has(product.id) ? stagedColors.get(product.id) : (Array.isArray(product.colorStock) && product.colorStock.length
        ? product.colorStock.map((entry) => ({ color: String(entry.color), quantity: Number(entry.quantity) || 0, ...(entry.imageUrl ? { imageUrl: String(entry.imageUrl) } : {}) }))
        : (requestedColor && Number(product.stockQty) > 0 ? [{ color: "Unspecified", quantity: Number(product.stockQty) }] : []));
      const effectiveColor = requestedColor || (existingColors.length ? "Unspecified" : (item.imageUrl ? "default" : ""));
      const current = stagedStock.has(product.id) ? stagedStock.get(product.id) : Number(product.stockQty) || 0;
      let nextColors = existingColors;
      let colorPreviousStock = null;
      let colorResultingStock = null;
      if (effectiveColor) {
        nextColors = existingColors.map((entry) => ({ ...entry }));
        const colorIndex = nextColors.findIndex((entry) => String(entry.color).toLowerCase() === effectiveColor.toLowerCase());
        colorPreviousStock = colorIndex >= 0 ? Number(nextColors[colorIndex].quantity) : 0;
        colorResultingStock = item.action === "adjustment" ? quantity : colorPreviousStock + (["sell", "damage", "missing"].includes(item.action) ? -quantity : quantity);
        if (colorResultingStock < 0) throw new Error("Stock cannot become negative for " + product.name + " (" + effectiveColor + ")");
        if (colorIndex >= 0) {
          nextColors[colorIndex].quantity = colorResultingStock;
          if (imageUrl) nextColors[colorIndex].imageUrl = imageUrl;
        } else nextColors.push({ color: effectiveColor, quantity: colorResultingStock, ...(imageUrl ? { imageUrl } : {}) });
      }
      const next = effectiveColor ? nextColors.reduce((sum, entry) => sum + Number(entry.quantity), 0) : (item.action === "adjustment" ? quantity : current + (["sell", "damage", "missing"].includes(item.action) ? -quantity : quantity));
      const delta = next - current;
      if (next < 0) throw new Error("Stock cannot become negative for " + product.name);
      stagedStock.set(product.id, next);
      if (effectiveColor) stagedColors.set(product.id, nextColors);
      movements.push({ product, item, quantity, delta, previousStock: current, proposedStock: next, color: requestedColor || null, size: requestedSize || null, colorPreviousStock, colorResultingStock, colorStock: effectiveColor ? nextColors : null });
    }
    for (const entry of movements) {
      entry.product.stockQty = entry.proposedStock;
      if (entry.colorStock) entry.product.colorStock = entry.colorStock;
      if (!products.some((product) => product.id === entry.product.id)) products.push(entry.product);
      const movement = {
        id: id(), businessId, productId: entry.product.id, productName: entry.product.name, action: entry.item.action,
        quantity: entry.quantity, unit: entry.item.unit ? String(entry.item.unit) : "units", color: entry.color, size: entry.size,
        colorPreviousStock: entry.colorPreviousStock, colorResultingStock: entry.colorResultingStock, delta: entry.delta,
        previousStock: entry.previousStock, resultingStock: entry.proposedStock, transcript: auditTranscript, rawTranscript: auditTranscript,
        parserVersion: String(parserVersion || "v2.1"), accountId: accountId || null, requestId: normalizedRequestId,
        clientRequestId: normalizedRequestId, createdAt: now(),
      };
      state.stockMovements.push(movement); entry.movement = movement;
    }
    return { products, movements: movements.map((entry) => entry.movement), idempotent: false };
  });
}
function listStockMovements(businessId, limit = 100) {
  const state = load();
  const movements = Array.isArray(state.stockMovements) ? state.stockMovements : [];
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  return movements
    .filter((movement) => movement.businessId === businessId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, safeLimit);
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

function findOrCreateConversation(state, businessId, customerId, channel, serviceLocationId = null) {
  let convo = state.conversations.find(
    (c) => c.businessId === businessId && c.customerId === customerId
  );
  if (!convo) {
    convo = { id: id(), businessId, customerId, channel, createdAt: now(), humanHandover: false, serviceLocationId: serviceLocationId || null };
    state.conversations.push(convo);
  } else if (serviceLocationId && convo.serviceLocationId !== serviceLocationId) {
    convo.previousServiceLocationId = convo.serviceLocationId || null;
    convo.serviceLocationId = serviceLocationId;
  }
  return convo;
}

// Set or clear the human-handover flag on a conversation.
// When true: AI stops auto-replying so the vendor can take over manually.
function setConversationHandover(businessId, customerPhone, active) {
  return mutate((state) => {
    const customer = state.customers.find((c) => c.businessId === businessId && c.phone === customerPhone);
    if (!customer) return null;
    const convo = state.conversations.find((c) => c.businessId === businessId && c.customerId === customer.id);
    if (!convo) return null;
    convo.humanHandover = !!active;
    convo.handoverAt    = active ? now() : null;
    return convo;
  });
}

// Returns conversations where humanHandover is true, enriched with customer info.
function getHandoverConversations(businessId) {
  const state = load();
  return (state.conversations || [])
    .filter((c) => c.businessId === businessId && c.humanHandover)
    .map((c) => {
      const customer = (state.customers || []).find((cu) => cu.id === c.customerId);
      const lastMsg  = (state.messages || []).filter((m) => m.conversationId === c.id).slice(-1)[0];
      return {
        conversationId: c.id,
        customerId: c.customerId,
        customerPhone:  customer ? customer.phone : null,
        customerName:   customer ? customer.name  : null,
        handoverAt:     c.handoverAt || null,
        lastMessage:    lastMsg ? lastMsg.content : null,
      };
    });
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

function createOrder(state, { businessId, customerId, items, serviceLocationId = null }) {
  // items: [{ productId, quantity }]
  if (serviceLocationId) {
    const location = (state.serviceLocations || []).find((item) => item.id === serviceLocationId && item.businessId === businessId && item.active);
    if (!location) throw httpError(400, "Invalid or inactive service location");
  }
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
  const location = serviceLocationId ? state.serviceLocations.find((item) => item.id === serviceLocationId) : null;
  const order = {
    id: id(),
    businessId,
    customerId,
    status: "pending",
    fulfillmentStatus: "NEW",
    paymentStatus: "PENDING",
    paymentMethod: null,
    serviceLocationId: serviceLocationId || null,
    serviceLocationSnapshot: location ? { kind: location.kind, label: location.label } : null,
    totalAmount,
    items: resolvedItems,
    createdAt: now(),
    updatedAt: now(),
    revision: 1,
    history: [{
      type: "created",
      at: now(),
      detail: "Customer confirmed the order",
    }],
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

// paymentMeta: optional object saved onto the order for reconciliation,
// e.g. { mpesaTxnId, mpesaAmount, mpesaPhone, paymentMethod, paymentRef }
function updateOrderStatus(orderId, status, paymentMeta = null, { actor = "system" } = {}) {
  return mutate((state) => {
    const o = state.orders.find((o) => o.id === orderId);
    if (!o) throw httpError(404, "Order not found");
    const previousStatus = o.status;
    const previousFulfillmentStatus = o.fulfillmentStatus || null;
    const previousPaymentStatus = o.paymentStatus || null;
    o.status = status;
    if (o.fulfillmentStatus && !paymentMeta) {
      const fulfillment = ["pending", "confirmed", "paid", "fulfilled", "cancelled"].includes(status)
        ? ({ pending: "NEW", confirmed: "ACCEPTED", paid: "COMPLETED", fulfilled: "COMPLETED", cancelled: "CANCELLED" }[status] || status)
        : status;
      o.fulfillmentStatus = fulfillment;
    }
    if (paymentMeta && typeof paymentMeta === "object") {
      o.paymentMeta = { ...paymentMeta, paidAt: now() };
      o.paymentStatus = "PAID";
      o.paymentMethod = paymentMeta.paymentMethod || o.paymentMethod || null;
    }
    if (String(o.fulfillmentStatus || "").toUpperCase() === "CANCELLED" && !o.stockRestoredAt) {
      for (const item of o.items || []) {
        const product = state.products.find((candidate) => candidate.id === item.productId && candidate.businessId === o.businessId);
        if (product) product.stockQty = Number(product.stockQty || 0) + Number(item.quantity || 0);
      }
      o.stockRestoredAt = now();
    }
    o.updatedAt = now();
    o.revision = Number(o.revision || 1) + 1;
    if (!Array.isArray(o.history)) o.history = [];
    o.history.push({
      type: paymentMeta ? "payment" : "status",
      at: o.updatedAt,
      actor,
      from: paymentMeta ? previousPaymentStatus : previousFulfillmentStatus || previousStatus,
      to: paymentMeta ? "PAID" : o.fulfillmentStatus || status,
      ...(paymentMeta ? { paymentMethod: paymentMeta.paymentMethod || null, paymentRef: paymentMeta.mpesaTxnId || paymentMeta.paymentRef || null } : {}),
    });
    return o;
  });
}

function updateOrderItems(orderId, requestedItems, { actor = "merchant" } = {}) {
  if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
    throw httpError(400, "An order must contain at least one item");
  }
  return mutate((state) => {
    const order = state.orders.find((candidate) => candidate.id === orderId);
    if (!order) throw httpError(404, "Order not found");
    if (order.paymentStatus === "PAID" || ["paid", "fulfilled"].includes(String(order.status).toLowerCase())) {
      throw httpError(409, "Paid orders cannot be edited; cancel and create a corrected order instead");
    }
    const fulfillment = String(order.fulfillmentStatus || order.status || "").toUpperCase();
    if (!["NEW", "ACCEPTED", "PENDING", "CONFIRMED"].includes(fulfillment)) {
      throw httpError(409, "Only new or accepted orders can be edited");
    }

    const quantities = new Map();
    for (const item of requestedItems) {
      const productId = String(item && item.productId || "");
      const quantity = Number(item && item.quantity);
      if (!productId || !Number.isInteger(quantity) || quantity < 1) {
        throw httpError(400, "Each order item requires a productId and a whole quantity of at least 1");
      }
      quantities.set(productId, (quantities.get(productId) || 0) + quantity);
    }

    const oldByProduct = new Map((order.items || []).map((item) => [item.productId, Number(item.quantity || 0)]));
    const resolvedItems = [];
    for (const [productId, quantity] of quantities) {
      const product = state.products.find((candidate) => candidate.id === productId && candidate.businessId === order.businessId && candidate.active !== false);
      if (!product) throw httpError(400, `Unknown or inactive product: ${productId}`);
      const previouslyReserved = oldByProduct.get(productId) || 0;
      const available = Number(product.stockQty || 0) + previouslyReserved;
      if (quantity > available) throw httpError(409, `Only ${available} of ${product.name} are available`);
      resolvedItems.push({
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice: Number(product.price || 0),
      });
    }

    for (const oldItem of order.items || []) {
      const product = state.products.find((candidate) => candidate.id === oldItem.productId && candidate.businessId === order.businessId);
      if (product) product.stockQty = Number(product.stockQty || 0) + Number(oldItem.quantity || 0);
    }
    for (const item of resolvedItems) decrementStock(state, item.productId, item.quantity);

    const before = (order.items || []).map((item) => ({ productId: item.productId, productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice }));
    order.items = resolvedItems;
    order.totalAmount = resolvedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    order.updatedAt = now();
    order.revision = Number(order.revision || 1) + 1;
    if (!Array.isArray(order.history)) order.history = [];
    order.history.push({
      type: "items",
      at: order.updatedAt,
      actor,
      before,
      after: resolvedItems.map((item) => ({ productId: item.productId, productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice })),
      totalAmount: order.totalAmount,
    });
    return order;
  });
}

// Correlates a real Daraja STK push request to the order it was for, so
// that when Safaricom's asynchronous payment callback arrives (see
// /webhook/mpesa in server.js and src/mpesa.js's handleStkCallback), we
// know which order to mark paid — the callback only carries Safaricom's
// own CheckoutRequestID, not our order id.
function attachMpesaCheckoutRequest(orderId, checkoutRequestId, { merchantRequestId = null, phone = null, amount = null } = {}) {
  return mutate((state) => {
    const o = state.orders.find((o) => o.id === orderId);
    if (!o) throw httpError(404, "Order not found");
    o.mpesaCheckoutRequestId = checkoutRequestId;
    o.mpesaPaymentAttempt = {
      status: "PENDING",
      checkoutRequestId,
      merchantRequestId,
      phone,
      amount: Number(amount ?? o.totalAmount),
      requestedAt: now(),
    };
    o.updatedAt = now();
    o.revision = Number(o.revision || 1) + 1;
    if (!Array.isArray(o.history)) o.history = [];
    o.history.push({
      type: "payment_attempt",
      at: o.updatedAt,
      actor: "customer",
      to: "PENDING",
      checkoutRequestId,
      amount: Number(amount ?? o.totalAmount),
    });
    return o;
  });
}

function updateMpesaPaymentAttempt(checkoutRequestId, { status, resultCode = null, resultDesc = null, transactionId = null } = {}) {
  return mutate((state) => {
    const order = state.orders.find((candidate) => candidate.mpesaCheckoutRequestId === checkoutRequestId);
    if (!order) return null;
    order.mpesaPaymentAttempt = {
      ...(order.mpesaPaymentAttempt || { checkoutRequestId }),
      status,
      resultCode,
      resultDesc: resultDesc ? String(resultDesc).slice(0, 300) : null,
      transactionId,
      completedAt: now(),
    };
    order.updatedAt = now();
    order.revision = Number(order.revision || 1) + 1;
    if (!Array.isArray(order.history)) order.history = [];
    order.history.push({
      type: "payment_attempt",
      at: order.updatedAt,
      actor: "safaricom",
      from: "PENDING",
      to: status,
      resultCode,
      resultDesc: resultDesc ? String(resultDesc).slice(0, 300) : null,
      transactionId,
    });
    return order;
  });
}

// Find a business by its Safaricom shortcode (paybill or till number).
// Used by the C2B webhook to route incoming payments to the right business.
function getBusinessByShortcode(shortcode) {
  const code = String(shortcode || "").trim();
  if (!code) return null;
  return load().businesses.find(
    (b) =>
      b.mpesa?.shortcode === code && b.mpesa?.verified === true && b.mpesa?.enabled === true && b.paymentMethod !== "bank"
  ) || null;
}

// Returns pending/confirmed orders for a business, enriched with customerPhone.
function getPendingOrdersForBusiness(businessId) {
  const state = load();
  return (state.orders || [])
    .filter((o) => o.businessId === businessId && (
      o.status === "pending" || o.status === "confirmed" ||
      (o.fulfillmentStatus && !["COMPLETED", "CANCELLED"].includes(String(o.fulfillmentStatus).toUpperCase()) && o.paymentStatus !== "PAID")
    ))
    .map((o) => {
      const customer = (state.customers || []).find((c) => c.id === o.customerId);
      return { ...o, customerPhone: customer ? customer.phone : null, customerName: customer ? customer.name : null };
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


function createDeniEntry(businessId, { customerPhone, customerName = null, amount, product = null, dueDate = null }, actor = "vendor") {
  const normalizedPhone = normalizePhone(customerPhone);
  const numericAmount = Number(amount);
  if (!normalizedPhone || normalizedPhone.length < 10) throw httpError(400, "A valid customer phone number is required");
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw httpError(400, "amount must be a positive number");
  return mutate((state) => {
    if (!state.businesses.some((item) => item.id === businessId)) throw httpError(404, "Business not found");
    state.deniBook = Array.isArray(state.deniBook) ? state.deniBook : [];
    const entry = { id: id(), businessId, customerPhone: normalizedPhone, customerName: customerName ? String(customerName).trim().slice(0, 120) : null, amount: Math.round(numericAmount * 100) / 100, product: product ? String(product).trim().slice(0, 200) : null, status: "unpaid", createdAt: now(), dueDate: dueDate || null, updatedAt: now() };
    state.deniBook.push(entry);
    return entry;
  });
}

function listDeniEntries(businessId, status = null) {
  const entries = (load().deniBook || []).filter((item) => item.businessId === businessId);
  return status ? entries.filter((item) => item.status === status) : entries;
}

function updateDeniEntry(businessId, entryId, { status, amount, dueDate }, actor = "vendor") {
  if (status !== undefined && !["unpaid", "partial", "paid"].includes(status)) throw httpError(400, "status must be unpaid, partial, or paid");
  if (amount !== undefined && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) throw httpError(400, "amount must be a positive number");
  return mutate((state) => {
    const entry = (state.deniBook || []).find((item) => item.id === entryId && item.businessId === businessId);
    if (!entry) throw httpError(404, "Deni entry not found");
    if (status !== undefined) entry.status = status;
    if (amount !== undefined) entry.amount = Math.round(Number(amount) * 100) / 100;
    if (dueDate !== undefined) entry.dueDate = dueDate || null;
    entry.updatedAt = now();
    return entry;
  });
}

function getDailyReportSettings(businessId) {
  const business = getBusiness(businessId);
  return { enabled: business.dailyReportEnabled === true, time: business.dailyReportTime || "19:00", optIn: business.reportWhatsAppOptIn === true, reportPhoneMasked: business.reportWhatsAppOptIn === true ? maskPhone(business.personalPhone) : null, lowStockThreshold: Number.isFinite(Number(business.stockAlerts && business.stockAlerts.lowThreshold)) ? Number(business.stockAlerts.lowThreshold) : 5 };
}

function updateDailyReportSettings(businessId, { enabled, time, optIn, lowStockThreshold }, actor = "vendor") {
  if (time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) throw httpError(400, "time must use HH:MM format");
  if (lowStockThreshold !== undefined && (!Number.isInteger(Number(lowStockThreshold)) || Number(lowStockThreshold) < 0 || Number(lowStockThreshold) > 100000)) throw httpError(400, "lowStockThreshold must be a whole number from 0 to 100000");
  const patch = {};
  if (enabled !== undefined) patch.dailyReportEnabled = Boolean(enabled);
  if (time !== undefined) patch.dailyReportTime = String(time);
  if (optIn !== undefined) patch.reportWhatsAppOptIn = Boolean(optIn);
  if (lowStockThreshold !== undefined) patch.stockAlerts = { lowThreshold: Number(lowStockThreshold) };
  return updateBusiness(businessId, patch, actor);
}

function getDailyReportData(businessId, dateString = null) {
  const business = getBusiness(businessId);
  const date = dateString || new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
  const state = load();
  const dayOf = (value) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(value)) : null;
  const orders = (state.orders || []).filter((order) => order.businessId === businessId && ["paid", "fulfilled"].includes(order.status) && dayOf((order.paymentMeta && order.paymentMeta.paidAt) || order.updatedAt || order.createdAt) === date);
  const total = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const mpesaOrders = orders.filter((order) => String(order.paymentMeta && order.paymentMeta.paymentMethod || "").startsWith("mpesa"));
  const deni = (state.deniBook || []).filter((entry) => entry.businessId === businessId && dayOf(entry.createdAt) === date && entry.status !== "paid");
  const threshold = Number(business.stockAlerts && business.stockAlerts.lowThreshold) || 5;
  const lowStock = (state.products || []).filter((product) => product.businessId === businessId && Number(product.stock || 0) <= threshold).map((product) => ({ name: product.name, stock: Number(product.stock || 0) }));
  return { date, businessName: business.name, shopNumber: business.pesaAiNumber || business.shopNumber || null, salesCount: orders.length, totalSales: total, mpesaTotal: mpesaOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0), mpesaCount: mpesaOrders.length, deniTotal: deni.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), deniCount: deni.length, deni, lowStock };
}

function createDeniRequest({ businessId, customerPhone, customerName = null, amount, product = null, orderId = null }) {
  const normalizedPhone = normalizePhone(customerPhone);
  const numericAmount = Number(amount);
  if (!normalizedPhone || !Number.isFinite(numericAmount) || numericAmount <= 0) throw httpError(400, "Invalid Deni request");
  return mutate((state) => {
    state.deniBook = Array.isArray(state.deniBook) ? state.deniBook : [];
    const existing = state.deniBook.slice().reverse().find((item) => item.businessId === businessId && item.orderId === orderId && item.status === "pending_approval");
    if (existing) return existing;
    const entry = { id: id(), businessId, orderId, customerPhone: normalizedPhone, customerName: customerName ? String(customerName).slice(0, 120) : null, amount: Math.round(numericAmount * 100) / 100, product: product ? String(product).slice(0, 200) : null, status: "pending_approval", createdAt: now(), updatedAt: now() };
    state.deniBook.push(entry);
    return entry;
  });
}

function approveLatestDeniRequest(businessId) {
  return mutate((state) => {
    const entry = (state.deniBook || []).slice().reverse().find((item) => item.businessId === businessId && item.status === "pending_approval");
    if (!entry) return null;
    entry.status = "unpaid";
    entry.updatedAt = now();
    return entry;
  });
}

function recordSaleForOrder(order, paymentMeta = {}) {
  if (!order || !order.id) throw httpError(400, "Order is required");
  return mutate((state) => {
    state.sales = Array.isArray(state.sales) ? state.sales : [];
    const existing = state.sales.find((sale) => sale.orderId === order.id);
    if (existing) return { duplicate: true, sale: existing };
    const customer = (state.customers || []).find((item) => item.id === order.customerId);
    const sale = { id: id(), businessId: order.businessId, orderId: order.id, amount: order.totalAmount, mpesaMethod: paymentMeta.paymentMethod || null, mpesaRef: paymentMeta.mpesaTxnId || null, items: order.items || [], customerPhone: customer ? customer.phone : null, createdAt: now() };
    state.sales.push(sale);
    return { duplicate: false, sale };
  });
}

function wasDailyReportSent(businessId, date) {
  return (load().dailyReportRuns || []).some((item) => item.businessId === businessId && item.date === date);
}

function markDailyReportSent(businessId, date) {
  return mutate((state) => {
    state.dailyReportRuns = Array.isArray(state.dailyReportRuns) ? state.dailyReportRuns : [];
    if (!state.dailyReportRuns.some((item) => item.businessId === businessId && item.date === date)) state.dailyReportRuns.push({ businessId, date, sentAt: now() });
    return true;
  });
}

function runOneTimeWhatsAppRoutingCorrection({ businessName, phoneNumberId, wabaId, whatsappNumber, migrationId }) {
  return mutate((state) => {
    state.migrations = state.migrations && typeof state.migrations === "object" ? state.migrations : {};
    if (state.migrations[migrationId]) return { applied: false, reason: "already-applied", businessId: state.migrations[migrationId].businessId };
    const matches = (state.businesses || []).filter((business) => business.name === businessName);
    if (matches.length !== 1) throw new Error("WhatsApp routing correction expected exactly one business named " + businessName + ", found " + matches.length);
    const business = matches[0];
    business.whatsappPhoneNumberId = String(phoneNumberId);
    business.whatsappWabaId = String(wabaId);
    business.whatsappNumber = normalizePhone(whatsappNumber);
    business.whatsappRequestedPhone = normalizePhone(whatsappNumber);
    if (business.whatsappAccessTokenEnc) business.whatsappConnectionStatus = "live";
    state.migrations[migrationId] = { appliedAt: now(), businessId: business.id, fields: ["whatsappPhoneNumberId", "whatsappWabaId", "whatsappNumber", "whatsappRequestedPhone"] };
    return { applied: true, businessId: business.id };
  });
}

function runOneTimePhoneCorrection({ shopPhone, personalPhone, personalPhoneRaw, shopPhoneRaw, whatsappNumber, whatsappRequestedPhone, migrationId }) {
  return mutate((state) => {
    state.migrations = state.migrations && typeof state.migrations === "object" ? state.migrations : {};
    if (state.migrations[migrationId]) return { applied: false, reason: "already-applied", businessId: state.migrations[migrationId].businessId };
    const target = normalizePhone(shopPhone);
    const matches = (state.businesses || []).filter((business) => [business.shopPhone, business.shopPhoneRaw, business.whatsappNumber, business.whatsappRequestedPhone, business.shopNumber, business.phone].some((value) => normalizePhone(value) === target));
    if (matches.length !== 1) throw new Error("Phone correction expected exactly one matching business, found " + matches.length);
    const business = matches[0];
    Object.assign(business, { personalPhone: normalizePhone(personalPhone), personalPhoneRaw, shopPhone: normalizePhone(shopPhone), shopPhoneRaw, whatsappNumber: normalizePhone(whatsappNumber), whatsappRequestedPhone: normalizePhone(whatsappRequestedPhone) });
    state.migrations[migrationId] = { appliedAt: now(), businessId: business.id, fields: ["personalPhone", "personalPhoneRaw", "shopPhone", "shopPhoneRaw", "whatsappNumber", "whatsappRequestedPhone"] };
    return { applied: true, businessId: business.id };
  });
}
module.exports = {
  DATA_FILE,
  normalizeMerchantType,
  loadRaw,
  requestWhatsAppConnection,
  getVendorWhatsAppStatus,
  load,
  mutate,
  runOneTimeSafeReset,
  runOneTimePhoneCorrection,
  runOneTimeWhatsAppRoutingCorrection,
  restoreDeletedBusinessForSingleOrphanedAccount,
  repairSingleOrphanedAccount,
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
  generateWelcomeMessage,
  createBusiness,
  listBusinesses,
  getBusiness,
  getPublicShopSlug,
  isPublicShopDiscoverable,
  searchPublicShopsByPhone,
  getPublicShopBySlug,
  searchPublicProducts,
  getBusinessByWhatsappPhoneNumberId,
  updateBusiness,
  setWhatsAppCredentials,
  setWhatsAppConnectionStatus,
  getWhatsAppStatus,
  sanitizeBusiness,
  setPlatformDaraja, getPlatformDarajaStatus, getPlatformDarajaDecrypted,
  setMpesaReceivingAccount, setMerchantStkPasskey,
  verifyMpesaCredentials,
  recordMpesaTransaction,
  createDeniEntry, listDeniEntries, updateDeniEntry,
  getDailyReportSettings, updateDailyReportSettings, getDailyReportData,
  createDeniRequest, approveLatestDeniRequest, recordSaleForOrder,
  wasDailyReportSent, markDailyReportSent,
  clearMpesaCredentials,
  getMpesaStatus,
  getMpesaCredentialsDecrypted,
  createAccount,
  getAccountByEmail,
  getAccountByPersonalPhone,
  normalizePhone,
  maskPhone,
  maskEmail,
  updateAccountRecoveryEmail,
  createOtpChallenge,
  verifyOtpChallenge,
  markPersonalPhoneVerified,
  createPendingSignup,
  getPendingSignup,
  cancelPendingSignup,
  markPendingSignupChannelVerified,
  finalizePendingSignup,
  getAccountById,
  resetAccountPasswordByBusinessId,
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
  confirmStockMovements,
  listStockMovements,
  findOrCreateCustomer,
  findOrCreateConversation,
  addMessage,
  getConversationHistory,
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
  updateOrderItems,
  attachMpesaCheckoutRequest,
  updateMpesaPaymentAttempt,
  getOrderByCheckoutRequestId,
  getBusinessByShortcode,
  getPendingOrdersForBusiness,
  setConversationHandover,
  getHandoverConversations,
  getActivityFeed,
  getSalesSummary,
  createReport,
  getReportsGroupedByBusiness,
  updateReportStatus,
  suspendBusiness,
  unsuspendBusiness,
  getAdminStats,
  getAdminGrowthSummary,
  createVideoScan,
  getVideoScan,
  updateVideoScan,
  listVideoScans,
  deleteVideoScan,
  listKnowledgeEntries,
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
  createServiceLocation,
  listServiceLocations,
  updateServiceLocation,
  deleteServiceLocation,
  resolveServiceLocation,
  getServiceLocationForBusiness,
};

// ── Video Scan ──────────────────────────────────────────────────────────────

const SCAN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// --- Reusable merchant intelligence and service locations -----------------
function listKnowledgeEntries(businessId) {
  return (load().knowledgeEntries || []).filter((entry) => entry.businessId === businessId && entry.approved !== false);
}

function createKnowledgeEntry(businessId, { title, category, text, source }) {
  if (!String(title || "").trim() || !String(text || "").trim()) throw httpError(400, "title and text are required");
  if (String(text).length > 100000) throw httpError(413, "knowledge text must be 100,000 characters or fewer");
  return mutate((state) => {
    if (!state.businesses.some((b) => b.id === businessId)) throw httpError(404, "Business not found");
    if (!Array.isArray(state.knowledgeEntries)) state.knowledgeEntries = [];
    const entry = { id: id(), businessId, title: String(title).trim().slice(0, 160), category: category ? String(category).trim().slice(0, 80) : "general", text: String(text).trim(), source: source ? String(source).trim().slice(0, 300) : "merchant", approved: true, createdAt: now(), updatedAt: now() };
    state.knowledgeEntries.push(entry);
    return entry;
  });
}

function updateKnowledgeEntry(businessId, entryId, patch) {
  return mutate((state) => {
    if (!Array.isArray(state.knowledgeEntries)) state.knowledgeEntries = [];
    const entry = state.knowledgeEntries.find((item) => item.id === entryId && item.businessId === businessId);
    if (!entry) throw httpError(404, "Knowledge entry not found");
    if (patch.title !== undefined && !String(patch.title).trim()) throw httpError(400, "title cannot be empty");
    if (patch.text !== undefined && !String(patch.text).trim()) throw httpError(400, "text cannot be empty");
    if (patch.text !== undefined && String(patch.text).length > 100000) throw httpError(413, "knowledge text must be 100,000 characters or fewer");
    for (const key of ["title", "category", "text", "source"]) if (patch[key] !== undefined) entry[key] = String(patch[key]).trim().slice(0, key === "text" ? 100000 : 300);
    entry.updatedAt = now();
    return entry;
  });
}

function deleteKnowledgeEntry(businessId, entryId) {
  return mutate((state) => {
    if (!Array.isArray(state.knowledgeEntries)) state.knowledgeEntries = [];
    const before = state.knowledgeEntries.length;
    state.knowledgeEntries = state.knowledgeEntries.filter((item) => !(item.id === entryId && item.businessId === businessId));
    if (state.knowledgeEntries.length === before) throw httpError(404, "Knowledge entry not found");
    return { ok: true };
  });
}

function createServiceLocation(businessId, { kind = "TABLE", label, active = true } = {}) {
  if (!String(label || "").trim()) throw httpError(400, "label is required");
  return mutate((state) => {
    if (!state.businesses.some((b) => b.id === businessId)) throw httpError(404, "Business not found");
    if (!Array.isArray(state.serviceLocations)) state.serviceLocations = [];
    if (state.serviceLocations.some((item) => item.businessId === businessId && item.label.trim().toLowerCase() === String(label).trim().toLowerCase())) {
      throw httpError(409, "A service location with this label already exists");
    }
    const location = { id: id(), businessId, kind: String(kind).toUpperCase().slice(0, 40), label: String(label).trim().slice(0, 120), active: active !== false, publicToken: crypto.randomBytes(24).toString("base64url"), createdAt: now(), updatedAt: now() };
    state.serviceLocations.push(location);
    return location;
  });
}

function listServiceLocations(businessId) {
  return (load().serviceLocations || []).filter((item) => item.businessId === businessId);
}

function updateServiceLocation(businessId, locationId, patch) {
  return mutate((state) => {
    if (!Array.isArray(state.serviceLocations)) state.serviceLocations = [];
    const location = state.serviceLocations.find((item) => item.id === locationId && item.businessId === businessId);
    if (!location) throw httpError(404, "Service location not found");
    if (patch.label !== undefined && !String(patch.label).trim()) throw httpError(400, "label cannot be empty");
    if (patch.label !== undefined && state.serviceLocations.some((item) => item.id !== locationId && item.businessId === businessId && item.label.trim().toLowerCase() === String(patch.label).trim().toLowerCase())) {
      throw httpError(409, "A service location with this label already exists");
    }
    if (patch.kind !== undefined) location.kind = String(patch.kind).toUpperCase().slice(0, 40);
    if (patch.label !== undefined) location.label = String(patch.label).trim().slice(0, 120);
    if (patch.active !== undefined) location.active = Boolean(patch.active);
    location.updatedAt = now();
    return location;
  });
}

function deleteServiceLocation(businessId, locationId) {
  return mutate((state) => {
    if (!Array.isArray(state.serviceLocations)) state.serviceLocations = [];
    const location = state.serviceLocations.find((item) => item.id === locationId && item.businessId === businessId);
    if (!location) throw httpError(404, "Service location not found");
    location.active = false;
    location.updatedAt = now();
    return location;
  });
}

function resolveServiceLocation(publicToken) {
  const token = String(publicToken || "");
  if (!token || token.length < 20) return null;
  const location = (load().serviceLocations || []).find((item) => item.publicToken === token && item.active);
  if (!location) return null;
  const business = load().businesses.find((item) => item.id === location.businessId);
  return business ? { location, business } : null;
}

function getServiceLocationForBusiness(businessId, locationId) {
  return (load().serviceLocations || []).find((item) => item.id === locationId && item.businessId === businessId && item.active) || null;
}

function createVideoScan(businessId, { name } = {}) {
  return mutate((state) => {
    if (!state.businesses.some((b) => b.id === businessId)) {
      throw httpError(404, "Business not found");
    }
    if (!state.videoScans) state.videoScans = [];

    // Purge scans older than 30 days — keeps db.json lean automatically
    const cutoff = Date.now() - SCAN_RETENTION_MS;
    const before = state.videoScans.length;
    state.videoScans = state.videoScans.filter((s) => new Date(s.createdAt).getTime() > cutoff);
    const purged = before - state.videoScans.length;
    if (purged > 0) console.log(`[db] Purged ${purged} video scan record(s) older than 30 days`);

    const scan = {
      id: id(),
      businessId,
      name: name ? String(name).trim().slice(0, 80) : null, // optional label, e.g. "Speakers"
      status: "pending",   // pending | processing | done | error | confirmed
      frames: 0,
      productCount: 0,
      productDrafts: [],
      error: null,
      createdAt: now(),
      processedAt: null,
    };
    state.videoScans.push(scan);
    return scan;
  });
}

function getVideoScan(scanId) {
  const state = load();
  if (!state.videoScans) return undefined;
  return state.videoScans.find((s) => s.id === scanId);
}

function updateVideoScan(scanId, patch) {
  return mutate((state) => {
    if (!state.videoScans) state.videoScans = [];
    const idx = state.videoScans.findIndex((s) => s.id === scanId);
    if (idx === -1) throw httpError(404, "Scan not found");
    const allowed = ["status", "frames", "productCount", "productDrafts", "error", "processedAt"];
    for (const key of allowed) {
      if (patch[key] !== undefined) state.videoScans[idx][key] = patch[key];
    }
    if (patch.status === "done" || patch.status === "error") {
      state.videoScans[idx].processedAt = now();
    }
    return state.videoScans[idx];
  });
}

function listVideoScans(businessId) {
  const state = load();
  if (!state.videoScans) return [];
  return state.videoScans
    .filter((s) => s.businessId === businessId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);
}

function deleteVideoScan(scanId) {
  return mutate((state) => {
    if (!state.videoScans) return;
    state.videoScans = state.videoScans.filter((s) => s.id !== scanId);
  });
}

// --- Activity feed -------------------------------------------------------

// Returns a merged, time-sorted list of AI replies and orders for the vendor
// dashboard's AI Activity Feed card.  Limit defaults to 20.
function getActivityFeed(businessId, limit = 20) {
  const state = load();

  // Build lookup maps for this business
  const convos = (state.conversations || []).filter((c) => c.businessId === businessId);
  const convoIdSet = new Set(convos.map((c) => c.id));
  const convoById  = Object.fromEntries(convos.map((c) => [c.id, c]));
  const customerById = Object.fromEntries(
    (state.customers || [])
      .filter((c) => c.businessId === businessId)
      .map((c) => [c.id, c])
  );

  // AI reply events — take assistant messages only (skip system/user)
  const aiEvents = (state.messages || [])
    .filter((m) => convoIdSet.has(m.conversationId) && m.role === "assistant")
    .map((m) => {
      const convo    = convoById[m.conversationId];
      const customer = customerById[convo?.customerId] || {};
      return {
        type:          "ai_reply",
        customerPhone: customer.phone  || null,
        customerName:  customer.name   || null,
        preview:       typeof m.content === "string" ? m.content.slice(0, 120) : null,
        createdAt:     m.createdAt,
      };
    });

  // Order events
  const orderEvents = (state.orders || [])
    .filter((o) => o.businessId === businessId)
    .map((o) => ({
      type:          "order",
      customerPhone: o.customerPhone || null,
      customerName:  null,
      total:         o.total     || 0,
      itemCount:     Array.isArray(o.items) ? o.items.length : 0,
      createdAt:     o.createdAt,
    }));

  return [...aiEvents, ...orderEvents]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}
