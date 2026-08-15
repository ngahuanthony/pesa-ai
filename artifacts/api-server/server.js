#!/usr/bin/env node
// Entry point for Pesa AI API server on Replit.
// Uses the battle-tested Node.js server logic from the GitHub repo.
// Run via: node --watch server.js (dev) or node server.js (prod)

const http = require("http");
const path = require("path");
const url = require("url");
const crypto = require("crypto");
const persistence = require("./pesa-src/persistence");
const router = require("./pesa-src/router");
const db = require("./pesa-src/db");
const auth = require("./pesa-src/auth");
const businessRoutes = require("./pesa-src/routes/business");
const productRoutes = require("./pesa-src/routes/products");
const orderRoutes = require("./pesa-src/routes/orders");
const chatRoutes = require("./pesa-src/routes/chat");
const authRoutes = require("./pesa-src/routes/auth");
const subscriptionRoutes = require("./pesa-src/routes/subscription");
const salesRoutes = require("./pesa-src/routes/sales");
const mpesaSettingsRoutes = require("./pesa-src/routes/mpesaSettings");
const adminRoutes = require("./pesa-src/routes/admin");
const reportsRoutes = require("./pesa-src/routes/reports");
const videoScanRoutes = require("./pesa-src/routes/video-scan");
const videoProcessor = require("./pesa-src/video-processor");
const whatsapp = require("./pesa-src/whatsapp");
const mpesa = require("./pesa-src/mpesa");

const PORT = Number(process.env.PORT) || 8080;

// --- route table ----------------------------------------------------------

router.post("/api/auth/signup", authRoutes.signup);
router.post("/api/auth/login", authRoutes.login);
router.post("/api/auth/logout", authRoutes.logout);
router.get("/api/auth/me", authRoutes.me);

router.post("/api/admin/login", adminRoutes.login);
router.get("/api/admin/businesses", adminRoutes.listBusinesses);
router.post("/api/admin/businesses/:businessId/subscription/charge", adminRoutes.chargeSubscription);
router.post("/api/admin/businesses/:businessId/suspend", adminRoutes.suspendBusiness);
router.post("/api/admin/businesses/:businessId/unsuspend", adminRoutes.unsuspendBusiness);
router.get("/api/admin/stats", adminRoutes.getStats);
router.post("/api/admin/businesses/:businessId/whatsapp", adminRoutes.setWhatsAppCredentials);
router.get("/api/admin/businesses/:businessId/whatsapp", adminRoutes.getWhatsAppStatus);
router.post("/api/admin/businesses/:businessId/mpesa", adminRoutes.setMpesaCredentials);
router.get("/api/admin/businesses/:businessId/mpesa", adminRoutes.getMpesaStatus);
router.delete("/api/admin/businesses/:businessId/mpesa", adminRoutes.disconnectMpesa);
router.post("/api/admin/businesses/:businessId/reset-password", adminRoutes.resetPassword);

router.post("/api/reports", reportsRoutes.create);
router.get("/api/admin/reports", reportsRoutes.list);
router.patch("/api/admin/reports/:id", reportsRoutes.updateStatus);

router.get("/api/businesses/:id", businessRoutes.get);
router.put("/api/businesses/:id", businessRoutes.update);
router.get("/api/businesses/:businessId/whatsapp/status", businessRoutes.getWhatsAppStatus);
router.post("/api/businesses/:businessId/whatsapp/request", businessRoutes.requestWhatsApp);

router.get("/api/businesses/:businessId/subscription", subscriptionRoutes.get);
router.post("/api/businesses/:businessId/subscription/charge", subscriptionRoutes.charge);
router.post("/api/businesses/:businessId/subscription/plan", subscriptionRoutes.changePlan);

router.get("/api/businesses/:businessId/products", productRoutes.list);
router.post("/api/businesses/:businessId/products", productRoutes.create);
router.post("/api/businesses/:businessId/products/import", productRoutes.importBulk);
router.put("/api/businesses/:businessId/products/:productId", productRoutes.update);
router.delete("/api/businesses/:businessId/products/:productId", productRoutes.remove);

router.get("/api/businesses/:businessId/orders", orderRoutes.list);
router.put("/api/businesses/:businessId/orders/:orderId/status", orderRoutes.updateStatus);
router.post("/api/businesses/:businessId/orders/:orderId/mpesa", orderRoutes.payWithMpesa);

router.get("/api/businesses/:businessId/mpesa/status", mpesaSettingsRoutes.status);
router.post("/api/businesses/:businessId/mpesa/connect", mpesaSettingsRoutes.connect);
router.post("/api/businesses/:businessId/mpesa/disconnect", mpesaSettingsRoutes.disconnect);

router.get("/api/businesses/:businessId/sales/summary", salesRoutes.summary);

router.get("/api/businesses/:businessId/video-scan",            videoScanRoutes.listScans);
router.get("/api/businesses/:businessId/video-scan/:scanId",     videoScanRoutes.getScan);
router.post("/api/businesses/:businessId/video-scan/:scanId/confirm", videoScanRoutes.confirmScan);

router.post("/api/businesses/:businessId/chat", chatRoutes.send);
// Note: chat history uses path param (not query) to avoid codegen type collision
router.get("/api/businesses/:businessId/chat/history/:customerPhone", chatRoutes.history);

router.get("/api/healthz", () => ({ ok: true }));
router.get("/api/health", () => ({
  ok: true,
  aiMode: process.env.ANTHROPIC_API_KEY ? "claude" : "mock (set ANTHROPIC_API_KEY for the real assistant)",
}));

// WhatsApp webhook — GET handled via router (no body needed)
router.get("/webhook/whatsapp", ({ query }) => {
  const result = whatsapp.verifyWebhook(query);
  if (result.ok) return { rawText: result.challenge };
  return { status: 403, data: { error: "verification failed" } };
});
// POST handled directly in the HTTP handler below (needs raw body for HMAC)

router.post("/webhook/mpesa", ({ body }) => {
  try {
    mpesa.handleStkCallback(body);
  } catch (err) {
    console.error("M-Pesa callback handling error:", err);
  }
  return { data: { ResultCode: 0, ResultDesc: "Accepted" } };
});

// --- HTTP plumbing -------------------------------------------------------

function sendJson(res, status, data, headers = {}) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-credentials": "true",
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = "";
    req.on("data", (c) => {
      chunks += c;
      if (chunks.length > 2_000_000) {
        reject(db.httpError(413, "Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!chunks) return resolve({});
      try {
        resolve(JSON.parse(chunks));
      } catch {
        reject(db.httpError(400, "Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

// Reads the raw body as a Buffer — used for the WhatsApp webhook so we can
// validate X-Hub-Signature-256 before parsing JSON.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      if (chunks.reduce((n, b) => n + b.length, 0) > 2_000_000) {
        reject(db.httpError(413, "Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Verifies X-Hub-Signature-256 from Meta. If WHATSAPP_APP_SECRET is not set
// the check is skipped (with a boot-time warning) so dev/staging still works.
function validateWhatsAppSignature(rawBody, sigHeader) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // warning already printed at boot
  if (!sigHeader || !sigHeader.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
  } catch {
    return false; // different lengths — definitely not equal
  }
}

function parseQuery(queryString) {
  const out = {};
  if (!queryString) return out;
  for (const part of queryString.split("&")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = decodeURIComponent(part.slice(0, eq));
    const value = decodeURIComponent(part.slice(eq + 1));
    out[key] = value;
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url);
  const pathname = parsed.pathname;

  // ── Video upload ──────────────────────────────────────────────────────
  // Handled before the generic router so we can read raw binary bytes
  // (the generic readBody() only handles JSON).
  const videoUploadMatch = req.method === "POST" &&
    pathname.match(/^\/api\/businesses\/([^/]+)\/video-scan\/upload$/);
  if (videoUploadMatch) {
    const businessId = videoUploadMatch[1];
    try {
      const session = auth.resolveSession(req);
      if (!session) { sendJson(res, 401, { error: "Not authenticated" }); return; }
      if (session.businessId !== businessId) { sendJson(res, 403, { error: "Not authorized for this business" }); return; }

      // Read raw video bytes (allow up to 200 MB)
      const chunks = [];
      let total = 0;
      await new Promise((resolve, reject) => {
        req.on("data", (c) => {
          const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
          total += buf.length;
          if (total > 200 * 1024 * 1024) {
            reject(db.httpError(413, "Video must be under 200 MB"));
            req.destroy();
            return;
          }
          chunks.push(buf);
        });
        req.on("end", resolve);
        req.on("error", reject);
      });
      const videoBuffer = Buffer.concat(chunks);
      if (videoBuffer.length === 0) { sendJson(res, 400, { error: "Empty video body" }); return; }

      // Create the scan record and kick off processing in the background
      const scan = db.createVideoScan(businessId);
      setImmediate(() => {
        videoProcessor.processVideoScan(db, scan.id, businessId, videoBuffer)
          .catch((err) => console.error("[video-upload] Background processing error:", err));
      });

      sendJson(res, 200, { scanId: scan.id });
    } catch (err) {
      const status = err.statusCode || 500;
      if (status >= 500) console.error(err);
      sendJson(res, status, { error: err.message || "Internal server error" });
    }
    return;
  }

  // ── WhatsApp POST webhook ─────────────────────────────────────────────
  // Handled here (before the generic router) so we can validate the raw
  // request body with HMAC-SHA256 before parsing JSON.
  if (req.method === "POST" && pathname === "/webhook/whatsapp") {
    try {
      const rawBody = await readRawBody(req);
      if (!validateWhatsAppSignature(rawBody, req.headers["x-hub-signature-256"])) {
        sendJson(res, 403, { error: "Invalid webhook signature" });
        return;
      }
      let body = {};
      if (rawBody.length > 0) {
        try { body = JSON.parse(rawBody.toString("utf8")); }
        catch { sendJson(res, 400, { error: "Invalid JSON body" }); return; }
      }
      whatsapp.handleIncomingWebhook(body).catch((err) =>
        console.error("[webhook] WhatsApp handling error:", err)
      );
      sendJson(res, 200, { received: true });
    } catch (err) {
      const status = err.statusCode || 500;
      sendJson(res, status, { error: err.message || "Internal server error" });
    }
    return;
  }

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,cookie",
      "access-control-allow-credentials": "true",
    });
    res.end();
    return;
  }

  const query = parseQuery(parsed.query);

  const session = auth.resolveSession(req);
  const match = router.match(req.method, pathname);

  if (!match) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  let body = {};
  try {
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      body = await readBody(req);
    }
    const result = await match.handler({ params: match.params, query, body, session, req });

    // A handler can return a special shape to set cookies or status codes
    if (result && result.cookie) {
      const responseData = result.data !== undefined ? result.data : result;
      const setCookieValue = result.cookie;
      const status = result.status || 200;
      sendJson(res, status, responseData, { "set-cookie": setCookieValue });
      return;
    }
    if (result && result.rawText !== undefined) {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(result.rawText);
      return;
    }
    const status = result && result.status ? result.status : 200;
    const data = result && result.data !== undefined && result.status ? result.data : result;
    sendJson(res, status, data);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error(err);
    sendJson(res, status, { error: err.message || "Internal server error" });
  }
});

// Restore database from Object Storage before accepting any requests.
// This ensures signups, products, and orders survive a redeploy.
persistence.init(db.DATA_FILE).then(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Pesa AI API running on port ${PORT}`);
    if (!process.env.ADMIN_PASSWORD)      console.warn("Warning: ADMIN_PASSWORD not set — admin panel disabled");
    if (!process.env.ANTHROPIC_API_KEY)   console.warn("Warning: ANTHROPIC_API_KEY not set — using mock AI");
    if (!process.env.ENCRYPTION_KEY)      console.warn("Warning: ENCRYPTION_KEY not set — M-Pesa credentials unencrypted");
    if (!process.env.WHATSAPP_APP_SECRET) console.warn("Warning: WHATSAPP_APP_SECRET not set — webhook signature validation disabled (set in admin Meta App Dashboard → App Settings → Basic)");
  });
}).catch((err) => {
  console.error("Fatal: could not initialise persistence layer:", err);
  process.exit(1);
});
