#!/bin/bash
# Pesa AI — Weekly deploy script
# Run on the Hetzner server to pull latest changes and restart.
# Usage: cd /opt/pesa-ai && ./deploy/deploy.sh

set -euo pipefail

APP_DIR="/opt/pesa-ai"
cd "$APP_DIR"

echo "╔═══════════════════════════════════╗"
echo "║     Pesa AI — Deploying...        ║"
echo "╚═══════════════════════════════════╝"

echo ""
echo "► Pulling latest code from GitHub..."
git pull origin main

echo ""
echo "► Installing any new dependencies..."
pnpm install --frozen-lockfile

echo ""
echo "► Rebuilding frontend..."
PORT=3000 BASE_PATH=/ NODE_ENV=production \
    pnpm --filter @workspace/pesa-ai run build

echo ""
echo "► Restarting API server..."
pm2 restart pesa-api

echo ""
echo "✅ Deploy complete! API is live."
pm2 status pesa-api
