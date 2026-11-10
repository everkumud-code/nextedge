#!/usr/bin/env bash
# Builds and starts NextEdge on 127.0.0.1 only. Does NOT touch any web server config.
# Run AFTER 1-inspect.sh. Safe to re-run (keeps existing .env and data).
set -euo pipefail
APP_DIR=/opt/nextedge
DOMAIN="${DOMAIN:-nextedge.nextresource.in}"
API_PORT="${API_PORT:-3010}"; ADMIN_PORT="${ADMIN_PORT:-3011}"
for p in $API_PORT $ADMIN_PORT; do
  if ss -ltn "sport = :$p" | grep -q LISTEN && ! docker ps --format '{{.Ports}}' | grep -q "127.0.0.1:$p->"; then echo "Port $p is already used by something else. Set API_PORT/ADMIN_PORT and re-run."; exit 1; fi
done
command -v docker >/dev/null || { echo "Docker is missing. Install it first (curl -fsSL https://get.docker.com | sh) then re-run."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose plugin missing."; exit 1; }
if [ -d "$APP_DIR/.git" ]; then git -C "$APP_DIR" pull --ff-only; else git clone https://github.com/everkumud-code/nextedge "$APP_DIR"; fi
cd "$APP_DIR"
if [ ! -f .env ]; then
  umask 077
  cat > .env <<EOF
DOMAIN=$DOMAIN
API_DOMAIN=$DOMAIN
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
OTP_MODE=none
SEED_ON_BOOT=true
API_PORT=$API_PORT
ADMIN_PORT=$ADMIN_PORT
MSG91_AUTH_KEY=
MSG91_TEMPLATE_ID=
ANTHROPIC_API_KEY=
FIREBASE_SERVICE_ACCOUNT_JSON=
EOF
  chmod 600 .env
  echo ".env created (secrets are random and stored only there)."
fi
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build
echo "Waiting for the API..."
for i in $(seq 1 60); do curl -fs "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1 && { echo "API healthy: http://127.0.0.1:$API_PORT/api/health"; break; }; sleep 3; [ $i = 60 ] && { echo "API did not become healthy. Check: docker compose -f docker-compose.yml -f docker-compose.vps.yml logs api"; exit 1; }; done
curl -fsI "http://127.0.0.1:$ADMIN_PORT/" >/dev/null && echo "Admin healthy: http://127.0.0.1:$ADMIN_PORT/"
echo "Demo data fills in the background (a few minutes). After it finishes run:  bash deploy/vps/6-seed-off.sh"
