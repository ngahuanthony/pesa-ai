---
name: Pesa AI product architecture
description: Business/admin split, user types, deployment info, Railway config
---

## Deployment
- **Railway live URL:** https://pesa-ai-production.up.railway.app
- **Railway project ID:** dc16955c-794f-4c30-a235-1997aee1f9e0
- **Railway service ID:** c603f4a6-d13d-4edd-bcda-b769dc70967b
- **Railway environment ID:** f956e490-8413-414b-a62b-655053a6d0c4
- **GitHub remote:** https://github.com/ngahuanthony/pesa-ai (push with token embedded in URL)
- **Domain target:** pesaai.africa (DNS CNAME → pesa-ai-production.up.railway.app, not yet set)

## Railway Build Config (nixpacks.toml)
```toml
[phases.setup]
nixPkgs = ["nodejs_22", "nodePackages.pnpm"]

[phases.install]
cmds = ["pnpm install --no-frozen-lockfile"]
```
**Why:** Railway's default Node is 18; Vite 7 requires 20+. Must pin Node 22 via nixPkgs and use --no-frozen-lockfile because Railway's pnpm version differs from Replit's.

## railway.toml build/start
- build: `PORT=3000 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/pesa-ai run build`
- start: `node artifacts/api-server/server.js`
- Do NOT include `pnpm install` in buildCommand — nixpacks handles it separately

## Static file serving (production)
- server.js serves `artifacts/pesa-ai/dist/public` as static files when NODE_ENV=production
- Falls back to index.html for unknown paths (React Router SPA)
- Triggered by `!match` handler checking `fs.existsSync(STATIC_DIR)`

## User types
- **Platform admin** — uses `ADMIN_PASSWORD` env var, manages all businesses
- **Business owner** — registered per business, manages their own products/orders/settings
- **Customer** — interacts via WhatsApp, no web login

## Key product facts
- Multi-tenant: each business has isolated products, orders, WhatsApp config, M-Pesa config
- AI scanner: video upload → frame extraction → Claude vision → product drafts with thumbnails
- WhatsApp: per-business phone number via shared WABA (platform token)
- M-Pesa: STK push per business (each needs own credentials)
