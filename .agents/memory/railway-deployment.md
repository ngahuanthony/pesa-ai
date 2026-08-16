---
name: Railway deployment
description: Pesa AI production deployment on Railway — URLs, IDs, and known issues
---

## Service details
- Project: `pesa-ai` — ID `dc16955c-794f-4c30-a235-1997aee1f9e0`
- Service: `pesa-ai` — ID `c603f4a6-d13d-4edd-bcda-b769dc70967b`
- Environment: `production` — ID `f956e490-8413-414b-a62b-655053a6d0c4`
- Live URL: `https://pesa-ai-production.up.railway.app` (always works)
- Custom domain: `pesaai.africa` — DNS correct, routing/SSL pending Railway propagation

## Volume
- Volume `pesa-ai-volume` mounted at `/app/artifacts/api-server/data` for persistence
- Data migrated: 5 businesses (including Digital Nation Accessories)

## WhatsApp webhook
- Currently set to: `https://pesa-ai-production.up.railway.app/webhook/whatsapp`
- Verify token: `pesaai-verify-2026`
- Once `pesaai.africa` SSL resolves: update to `https://pesaai.africa/webhook/whatsapp`
- Meta webhook config: https://developers.facebook.com/apps/3095173927353545/whatsapp-business/wa-settings/
- Meta app is UNPUBLISHED — must publish to receive real customer messages (not just test)

## Custom domain issue
- `pesaai.africa` CNAME → `t245woq5.up.railway.app` is correctly set in Namecheap
- Railway's load balancer returns "Application not found" (routing not yet propagated)
- SSL cert still serving `*.up.railway.app` wildcard — Railway hasn't provisioned pesaai.africa cert
- This is a Railway infrastructure propagation delay — resolves automatically, no code fix needed

**Why:** Railway custom domain routing and cert provisioning can take several hours on Hobby plan.

## Railway API token
- Token: stored in conversation history — do not re-read from secrets, use from context
- DNS CNAME target: `t245woq5.up.railway.app`
