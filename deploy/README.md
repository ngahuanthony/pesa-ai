# Pesa AI — Hetzner Deployment Guide

**Cost: ~€4.51/month** (CX22 VPS, everything on one server)

---

## 1. Create your Hetzner server

1. Sign up at https://hetzner.com → Cloud → New Project → "pesa-ai"
2. Add server:
   - **Image:** Ubuntu 24.04
   - **Type:** CX22 (2 vCPU / 4 GB RAM / 40 GB disk) — €4.51/month
   - **Location:** Helsinki or Nuremberg (pick whichever)
   - **SSH Key:** paste your public key (or Hetzner emails you a root password)
3. Note the server's **public IP address**

---

## 2. Point your domain to Hetzner

In your DNS provider (wherever pesaai.africa is registered):

| Type | Name | Value |
|------|------|-------|
| A    | @    | `<your-hetzner-ip>` |
| A    | www  | `<your-hetzner-ip>` |

DNS propagation takes 5–30 minutes.

---

## 3. SSH into your server

```bash
ssh root@<your-hetzner-ip>
```

---

## 4. Run the setup script

Copy the contents of `deploy/setup.sh` to your server and run it:

```bash
curl -o setup.sh https://raw.githubusercontent.com/ngahuanthony/pesa-ai-v2/main/deploy/setup.sh
chmod +x setup.sh
./setup.sh
```

This installs Node.js, nginx, PM2, certbot, clones your repo, builds the frontend, and starts everything. Takes about 5 minutes.

---

## 5. Configure environment secrets

```bash
nano /opt/pesa-ai/.env
```

Fill in every value from `.env.example`. Save with Ctrl+X → Y → Enter.

Then restart the server:
```bash
pm2 restart pesa-api
```

---

## 6. Migrate your existing data

On your **Replit** machine, download the database:
```bash
# In Replit shell
cat artifacts/api-server/data/db.json
```
Copy the output. On **Hetzner**:
```bash
nano /opt/pesa-ai/artifacts/api-server/data/db.json
# Paste the content, save
pm2 restart pesa-api
```

---

## 7. Get SSL certificate

```bash
certbot --nginx -d pesaai.africa -d www.pesaai.africa
```

Follow the prompts. Auto-renewal is set up automatically.

---

## 8. Update WhatsApp webhook URL

In Meta Developer Console → your app → WhatsApp → Configuration:
- **Callback URL:** `https://pesaai.africa/webhook`
- **Verify token:** same as your `WHATSAPP_VERIFY_TOKEN` env var

---

## Weekly update workflow

Every time you want to deploy new changes:

```bash
ssh root@<your-hetzner-ip>
cd /opt/pesa-ai
./deploy/deploy.sh
```

That's it. Pulls latest code, rebuilds frontend, restarts API — under 2 minutes.

---

## Useful commands

```bash
pm2 status              # check if server is running
pm2 logs pesa-api       # live server logs
pm2 restart pesa-api    # restart after config changes
nginx -t                # test nginx config
systemctl reload nginx  # apply nginx changes
cat /opt/pesa-ai/artifacts/api-server/data/db.json  # inspect database
```
