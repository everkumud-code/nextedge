#!/usr/bin/env bash
# Installs the NextFit / NextGlow / NextCare app (one codebase, three brands) in /opt/nextbrands, behind the existing nginx.
#   bash setup-brands.sh /root/nextbrands.tgz [superadmin-mobile] ["Superadmin name"]
# Needs: /etc/nextsoftwares.env (from install.sh prepare). Keeps an existing .env, database and uploads. Never prints a secret.
set -euo pipefail
TGZ="${1:-}"; [ -f "$TGZ" ] || { echo "usage: setup-brands.sh <source.tgz> [mobile] [name]"; exit 1; }
APP=/opt/nextbrands; ENVF=/etc/nextsoftwares.env; [ -f "$ENVF" ] || { echo "run install.sh prepare first"; exit 1; }; . "$ENVF"
say() { printf '\n==> %s\n' "$*"; }; rnd() { openssl rand -hex 24; }
mkdir -p "$APP"; tar -xzf "$TGZ" -C "$APP" --strip-components=1
cd "$APP"
if [ ! -f .env ]; then
  say "creating .env with fresh secrets"
  cp deploy/.env.production.example .env 2>/dev/null || : > .env
  set_kv() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
  set_kv DB_PASSWORD "$(rnd)"; set_kv JWT_SECRET "$(rnd)$(rnd)"; set_kv CRON_SECRET "$(rnd)"; set_kv WHATSAPP_WEBHOOK_SECRET "$(rnd)"
  set_kv PLATFORM_DOMAIN "$DOMAIN"; set_kv PUBLIC_URL "https://fit.$DOMAIN"; set_kv NEXTSOFT_INTERNAL_KEY "$NEXTSOFT_INTERNAL_KEY"
  set_kv OTHER_PRODUCT_CHECK_URLS "http://host.docker.internal:3012/api/workspace/check/"; set_kv COMPOSE_PROFILES ""; chmod 600 .env
fi
say "starting (database + app); the app listens only on 127.0.0.1:4000"
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d --build
for i in $(seq 1 40); do curl -fs http://127.0.0.1:4000/health >/dev/null 2>&1 && break; sleep 3; done
curl -s http://127.0.0.1:4000/health; echo
if [ -n "${2:-}" ]; then say "platform admin"; docker compose exec -T api node scripts/create-superadmin.js "$2" "${3:-Super Admin}"; fi
say "done. Until an OTP provider is set (OTP_PROVIDER, MSG91_AUTHKEY or the WhatsApp keys in .env) one-time codes are only printed in the app log; 'docker compose exec api node scripts/login-code.js <mobile>' shows the code for a number."
