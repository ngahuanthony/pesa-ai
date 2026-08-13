---
name: Pesa AI product architecture
description: What the product is, who the users are, and how the business/admin split works
---

Pesa AI (pesaai.africa) is a WhatsApp shop SaaS for Kenyan SMEs, built by Adplay Media Ltd.

**Two user types:**
1. **Business owners** — sign up, manage their shop (products, orders, billing, settings). Simple dashboard, no technical config.
2. **Platform admins (Adplay Media staff)** — access `/admin`, configure everything technical per business.

**Admin controls (business owners never touch):**
- WhatsApp Meta API: Phone Number ID, Access Token, Webhook URL, Verify Token
- M-Pesa Daraja API: Consumer Key, Consumer Secret, Passkey, Shortcode — all encrypted at rest via ENCRYPTION_KEY

**Business settings — 4 clean sections only:**
1. Shop Info (name, owner name, category)
2. Your Location (building, stall number, public phone — optional)
3. Your Assistant (name + plain-English personality description)
4. How You Get Paid (M-Pesa till/paybill number OR bank account)

**Business signup fields:** fullName, buildingName, stallNumber, publicPhone, nationalId. businessPhone is optional.

**Dashboard routes:** `/dashboard`, `/dashboard/products`, `/dashboard/orders`, `/dashboard/chat`, `/dashboard/billing`, `/dashboard/settings` — sidebar nav, each a separate URL.

**Admin panel:** `/admin` — dark navy sidebar (#080d1a), white main content. Sections: Businesses (per-business WhatsApp + M-Pesa config buttons), WhatsApp tab, Reports tab.

**Billing plans:** Starter KES 2,999 / Business KES 4,999 / Pro KES 9,999/month.

**Deployment:** Live at `https://sme-ai-connect.replit.app`. Custom domain `pesaai.africa` pending user DNS setup (add CNAME/A record from Replit Domains pane).
