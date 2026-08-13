---
name: Pesa AI backend setup
description: How the API server is structured, where the server files are, what env vars are needed, and critical route-file conventions
---

The API server is plain CJS Node.js — NO Express, NO TypeScript. All source lives in `artifacts/api-server/pesa-src/`. The entry point is `artifacts/api-server/server.js`.

**Production run command:** `node artifacts/api-server/server.js` (artifact.toml updated — no longer uses the old esbuild dist bundle).

**Dev script:** `node --watch server.js` (in `artifacts/api-server/package.json`).

**Route handler convention — CRITICAL:**
All route files export plain functions, NOT Express Router objects. Each function receives `{ params, body, session, query }` and returns data (or throws `db.httpError(status, message)`). Routes are registered in `server.js` route table like: `router.post("/api/reports", reportsRoutes.create)`.
Task agents routinely write Express-style route files — always rewrite to plain handler functions before the server can start.

**Response shape gotcha:** The server dispatches on `result.status` as the HTTP code. Never return an object with `status` as a string key (e.g. `{ status: "ok" }`) — use `{ ok: true }` instead, or `{ status: 201, data: {...} }` for non-200. The healthz route was bitten by this.

**Env vars — all now set as Replit Secrets:**
- `SESSION_SECRET` ✅
- `ADMIN_PASSWORD` ✅
- `ANTHROPIC_API_KEY` ✅ (real Claude AI active)
- `ENCRYPTION_KEY` ✅ (64-char hex, AES-256-GCM for M-Pesa/WhatsApp creds)
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` ✅ (GCS bucket for db.json persistence)
- `DATA_DIR` — not set; defaults to `artifacts/api-server/data/` (fine for dev; production uses Object Storage)
- `WHATSAPP_APP_SECRET` — NOT SET yet; webhook signature validation is disabled until set (get from Meta App Dashboard → App Settings → Basic)

**Data persistence — Object Storage write-through:**
`pesa-src/persistence.js` — on startup downloads `pesa-db.json` from Object Storage; after every `db.save()` pushes the file back asynchronously. The `@replit/object-storage` Client must be instantiated with `new Client({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID })` — passing `bucketId` explicitly (not `bucketName`; the sidecar returns empty string in dev).

**WhatsApp multi-tenant (fixed):**
`pesa-src/whatsapp.js` — `verifyWebhook` checks ALL businesses' `whatsappVerifyToken` fields (per-business), falling back to global `WHATSAPP_VERIFY_TOKEN` env. `handleIncomingWebhook` decrypts `business.whatsappAccessTokenEnc` and uses it for replies; falls back to global `WHATSAPP_TOKEN` only if no per-business token is set.

**Webhook signature validation:**
`server.js` intercepts `POST /webhook/whatsapp` before the router — reads raw Buffer body, validates `X-Hub-Signature-256` with HMAC-SHA256 using `WHATSAPP_APP_SECRET`. Skips validation (with boot warning) if secret not set.

**Router:** Custom tiny router in `pesa-src/router.js`. Has `get/post/put/patch/delete` methods.
**Auth alias:** `pesa-src/auth.js` exports `requireOwnBusiness` (alias for `requireBusinessAccess`).
**Chat history:** Path param `/chat/history/:customerPhone` (not query param — avoids Orval codegen collision).

**Admin-only routes (businesses never see these):**
- WhatsApp: `POST/GET /api/admin/businesses/:businessId/whatsapp`
- M-Pesa API creds: `POST/GET/DELETE /api/admin/businesses/:businessId/mpesa`
- Businesses only provide their paybill/bank account number in Settings — no API keys.

**Post-merge script (`scripts/post-merge.sh`):** Uses `pnpm install --no-frozen-lockfile` — task agents often remove/add deps without updating the lockfile; frozen mode would always fail.
