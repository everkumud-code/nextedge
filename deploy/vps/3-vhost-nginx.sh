#!/usr/bin/env bash
# Adds ONE nginx vhost for nextedge.nextresource.in. Run only if nginx owns 80/443 (see inspect output).
# Backs up what it touches, tests with nginx -t, reloads (not restarts). Does not edit other sites' files.
set -euo pipefail
DOMAIN="${DOMAIN:-nextedge.nextresource.in}"; API_PORT="${API_PORT:-3010}"; ADMIN_PORT="${ADMIN_PORT:-3011}"
BK=/root/backup-before-nextedge; mkdir -p "$BK"
getent hosts "$DOMAIN" | grep -q 187.126.116.161 || { echo "DNS: $DOMAIN does not point to this server yet. Add the A record and wait."; exit 1; }
CONF=/etc/nginx/sites-available/$DOMAIN
[ -e "$CONF" ] && cp -a "$CONF" "$BK/$(echo "$CONF" | tr / _).$(date +%s)"
cat > "$CONF" <<EOF
# NextEdge ($DOMAIN) - managed by deploy/vps/3-vhost-nginx.sh
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    client_max_body_size 25m;

    location /api/    { proxy_pass http://127.0.0.1:$API_PORT; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; proxy_read_timeout 120s; }
    location /iclock/ { proxy_pass http://127.0.0.1:$API_PORT; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; proxy_set_header X-Forwarded-Proto \$scheme; }
    location /        { proxy_pass http://127.0.0.1:$ADMIN_PORT; proxy_set_header Host \$host; proxy_set_header X-Forwarded-Proto \$scheme; }
}
EOF
ln -sf "$CONF" /etc/nginx/sites-enabled/$DOMAIN
if ! nginx -t; then rm -f /etc/nginx/sites-enabled/$DOMAIN; echo "nginx -t failed; vhost removed again, nothing reloaded."; exit 1; fi
systemctl reload nginx
echo "HTTP vhost live. Now TLS:"
if command -v certbot >/dev/null; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect -m "${CERT_EMAIL:?set CERT_EMAIL=you@example.com}" && nginx -t && systemctl reload nginx
else echo "certbot not found: get TLS the same way the other sites do, then reload nginx."; fi
