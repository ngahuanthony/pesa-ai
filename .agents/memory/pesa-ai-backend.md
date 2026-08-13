---
name: Pesa AI backend setup
description: How the API server is structured, where the server files are, what env vars are needed, and critical route-file conventions
---

The API server is plain CJS Node.js — NO Express, NO TypeScript. All source lives in `artifacts/api-server/pesa-src/`. The entry point is `artifacts/api-server/server.js`.

**Production run command:** `node artifacts/api-server/server.js` (artifact.toml updated — no longer uses the old esbuild dist bundle).

**Dev script:** `node --watch server.js` (in `artifacts/api-server/package.json`).

**Route handler convention — CRITICAL:**
All route files export plain functions, NOT Express Router objects. Each function receives `{ params, body, session, query }` and returns data (or throws `db.httpError(status, message)`). Routes are registered in `server.js` route table like: `router.post("/api/reports", reportsRoutes.create)`.

**Why this matters:** Task agents routinely write Express-style route files (`const router = express.Router(); router.get(...)`) which break immediately with "Cannot find module 'express'". Always rewrite to plain handler functions before the server can start.

**Env vars — all now set as Replit Secrets:**
- `SESSION_SECRET` ✅
- `ADMIN_PASSWORD` ✅
- `ANTHROPIC_API_KEY` ✅ (real Claude AI active)
- `ENCRYPTION_KEY` ✅ (64-char hex, AES-256-GCM for M-Pesa creds)
- `DATA_DIR` — not set; defaults to `artifacts/api-server/data/` (fine for now)

**Router:** Custom tiny router in `pesa-src/router.js`. Has `get/post/put/patch/delete` methods.
**Auth alias:** `pesa-src/auth.js` exports `requireOwnBusiness` (alias for `requireBusinessAccess`).
**Chat history:** Path param `/chat/history/:customerPhone` (not query param — avoids Orval codegen collision).

**Admin-only routes (businesses never see these):**
- WhatsApp: `POST/GET /api/admin/businesses/:businessId/whatsapp`
- M-Pesa API creds: `POST/GET/DELETE /api/admin/businesses/:businessId/mpesa`
- Businesses only provide their paybill/bank account number in Settings — no API keys.

**Post-merge script (`scripts/post-merge.sh`):** Uses `pnpm install --no-frozen-lockfile` — task agents often remove/add deps without updating the lockfile; frozen mode would always fail.
