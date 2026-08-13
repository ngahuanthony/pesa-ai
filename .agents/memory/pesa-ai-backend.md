---
name: Pesa AI backend setup
description: How the API server is structured, where the server files are, and what env vars are needed
---

The API server uses the GitHub repo's battle-tested CJS/Node.js server, NOT the TypeScript Express scaffold. All GitHub server source files live at `artifacts/api-server/pesa-src/` (not `src/`). The dev script in `artifacts/api-server/package.json` is `node --watch server.js`.

**Key file:** `artifacts/api-server/server.js` — adapted entry point that imports from `./pesa-src/` instead of `./src/`, adds suspend/unsuspend/stats admin routes, updates chat history to path param (not query param).

**Why:** The GitHub server had 0 npm install, battle-tested JS/JSON file DB, full working routes. Converting to TypeScript would have been a major rewrite with no gain.

**How to apply:** Any new routes go in server.js route table AND the relevant handler file in `pesa-src/routes/`. Then update openapi.yaml and run codegen.

**Env vars needed for full functionality:**
- `ADMIN_PASSWORD` — required for /admin panel
- `ANTHROPIC_API_KEY` — required for real AI (mock mode otherwise)
- `ENCRYPTION_KEY` — required for M-Pesa credential encryption
- `DATA_DIR` — path to persistent storage for JSON DB (defaults to ./data inside api-server)
- `WHATSAPP_TOKEN` — required for actual WhatsApp Business API

**Router:** Custom tiny router in pesa-src/router.js. Had to add `patch` method (was missing).
**Auth alias:** pesa-src/auth.js exports `requireOwnBusiness` as alias for `requireBusinessAccess`.
**Chat history:** Changed from query param (`?customerPhone=...`) to path param (`/chat/history/:customerPhone`) to avoid Orval codegen TS2308 collision.
