#!/bin/bash
# Pesa AI — Hetzner VPS setup script
# Run as root on a fresh Ubuntu 24.04 server.
# Usage: bash setup.sh
#
# What this does:
#   1. Updates the system
#   2. Installs Node.js 22, pnpm, nginx, PM2, certbot
#   3. Clones the repo from GitHub
#   4. Installs dependencies and builds the frontend
#   5. Configures nginx and PM2
#   6. Sets up daily database backups

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
GITHUB_REPO="https://github.com/ngahuanthony/pesa-ai-v2.git"
APP_DIR="/opt/pesa-ai"
LOG_DIR="/var/log/pesa-ai"
BACKUP_DIR="/opt/pesa-ai-backups"
DOMAIN="pesaai.africa"

echo "╔══════════════════════════════════════════╗"
echo "║        Pesa AI — Server Setup            ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. System update ──────────────────────────────────────────────────────────
echo ""
echo "► Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git nginx certbot python3-certbot-nginx unzip ufw

# ── 2. Node.js 22 ─────────────────────────────────────────────────────────────
echo ""
echo "► Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
echo "  Node.js $(node --version) installed."

# ── 3. pnpm ───────────────────────────────────────────────────────────────────
echo ""
echo "► Installing pnpm..."
npm install -g pnpm pm2
echo "  pnpm $(pnpm --version) installed."
echo "  PM2 $(pm2 --version) installed."

# ── 4. Directories ────────────────────────────────────────────────────────────
echo ""
echo "► Creating directories..."
mkdir -p "$LOG_DIR" "$BACKUP_DIR"

# ── 5. Clone repository ───────────────────────────────────────────────────────
echo ""
echo "► Cloning repository..."
if [ -d "$APP_DIR/.git" ]; then
    echo "  Repo already exists — pulling latest..."
    cd "$APP_DIR" && git pull origin main
else
    git clone "$GITHUB_REPO" "$APP_DIR"
fi
cd "$APP_DIR"

# ── 6. Install dependencies ───────────────────────────────────────────────────
echo ""
echo "► Installing Node dependencies..."
pnpm install --frozen-lockfile

# ── 7. Build frontend ─────────────────────────────────────────────────────────
echo ""
echo "► Building React frontend..."
mkdir -p artifacts/api-server/data
PORT=3000 BASE_PATH=/ NODE_ENV=production \
    pnpm --filter @workspace/pesa-ai run build
echo "  Frontend built to artifacts/pesa-ai/dist/public"

# ── 8. Environment file ───────────────────────────────────────────────────────
echo ""
if [ ! -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/deploy/.env.example" "$APP_DIR/.env"
    echo "  ⚠️  .env created from template — fill in your secrets:"
    echo "      nano $APP_DIR/.env"
else
    echo "  .env already exists — skipping."
fi

# ── 9. nginx ──────────────────────────────────────────────────────────────────
echo ""
echo "► Configuring nginx..."
cp "$APP_DIR/deploy/nginx.conf" "/etc/nginx/sites-available/$DOMAIN"
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx
echo "  nginx configured for $DOMAIN"

# ── 10. PM2 ───────────────────────────────────────────────────────────────────
echo ""
echo "► Starting API server with PM2..."
cd "$APP_DIR"
pm2 delete pesa-api 2>/dev/null || true
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash || true
echo "  PM2 configured — server will auto-restart on reboot."

# ── 11. Firewall ──────────────────────────────────────────────────────────────
echo ""
echo "► Configuring firewall..."
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable
echo "  Firewall: SSH + HTTP/HTTPS allowed."

# ── 12. Daily backup cron ─────────────────────────────────────────────────────
echo ""
echo "► Setting up daily database backups..."
cp "$APP_DIR/deploy/backup.sh" /usr/local/bin/pesa-backup
chmod +x /usr/local/bin/pesa-backup
# Run at 2am daily
(crontab -l 2>/dev/null | grep -v pesa-backup; echo "0 2 * * * /usr/local/bin/pesa-backup") | crontab -
echo "  Backup runs daily at 2am → $BACKUP_DIR"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅  Setup complete!                                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Next steps:                                                 ║"
echo "║  1. Fill in your secrets: nano /opt/pesa-ai/.env            ║"
echo "║  2. Restart the server:   pm2 restart pesa-api              ║"
echo "║  3. Get SSL certificate:                                     ║"
echo "║     certbot --nginx -d pesaai.africa -d www.pesaai.africa   ║"
echo "║  4. Migrate your data (see README.md step 6)                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
