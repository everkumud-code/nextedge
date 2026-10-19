#!/usr/bin/env bash
# One-shot installer for a fresh Ubuntu 22.04/24.04 VPS (Hostinger KVM).
# Usage:  bash install.sh https://github.com/<org>/coaching-connect.git app.yourdomain.in api.yourdomain.in
set -euo pipefail
REPO="${1:?repo url}"; DOMAIN="${2:?app domain}"; API_DOMAIN="${3:?api domain}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get install -y ca-certificates curl git ufw
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && yes | ufw enable || true
cd /opt
if [ -d coaching-connect ]; then cd coaching-connect && git pull; else git clone "$REPO" coaching-connect && cd coaching-connect; fi
if [ ! -f .env ]; then
  cp deploy/.env.example .env
  sed -i "s#^DOMAIN=.*#DOMAIN=$DOMAIN#; s#^API_DOMAIN=.*#API_DOMAIN=$API_DOMAIN#" .env
  sed -i "s#^DB_PASSWORD=.*#DB_PASSWORD=$(openssl rand -hex 24)#; s#^JWT_SECRET=.*#JWT_SECRET=$(openssl rand -hex 32)#" .env
fi
docker compose up -d --build
sleep 8
docker compose exec -T api sh -c "npx ts-node src/db/seed.ts" || echo "Seed skipped (already seeded?)"
echo "---------------------------------------------"
echo "Admin panel: https://$DOMAIN   API: https://$API_DOMAIN/api/health"
echo "Login: 9999900001  OTP: 123456 (dev mode)"
echo "Update later:  cd /opt/coaching-connect && git pull && docker compose up -d --build"
