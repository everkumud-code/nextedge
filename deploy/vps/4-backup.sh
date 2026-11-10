#!/usr/bin/env bash
# Installs a nightly pg_dump of the NextEdge database (14 days kept) at 03:17 server time.
set -euo pipefail
mkdir -p /backups/nextedge
cat > /usr/local/bin/nextedge-backup.sh <<'EOF'
#!/bin/sh
set -e
cd /opt/nextedge
f=/backups/nextedge/nextedge-$(date +%F_%H%M).dump
docker compose -f docker-compose.yml -f docker-compose.vps.yml exec -T db pg_dump -U coaching -Fc coaching_connect > "$f.partial" && mv "$f.partial" "$f"
find /backups/nextedge -name 'nextedge-*.dump' -mtime +14 -delete
EOF
chmod 750 /usr/local/bin/nextedge-backup.sh
echo '17 3 * * * root /usr/local/bin/nextedge-backup.sh >> /var/log/nextedge-backup.log 2>&1' > /etc/cron.d/nextedge-backup
chmod 644 /etc/cron.d/nextedge-backup
/usr/local/bin/nextedge-backup.sh && ls -lh /backups/nextedge
