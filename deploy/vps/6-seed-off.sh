#!/usr/bin/env bash
# After the first start: stop re-seeding demo data on every restart.
set -euo pipefail
cd /opt/nextedge
sed -i 's/^SEED_ON_BOOT=.*/SEED_ON_BOOT=false/' .env
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d api
echo "SEED_ON_BOOT=false and api recreated."
