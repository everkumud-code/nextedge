#!/usr/bin/env bash
# Adds ONE site block to an existing system Caddy (TLS is automatic). Run only if Caddy owns 80/443.
set -euo pipefail
DOMAIN="${DOMAIN:-nextedge.nextresource.in}"; API_PORT="${API_PORT:-3010}"; ADMIN_PORT="${ADMIN_PORT:-3011}"
CF=/etc/caddy/Caddyfile; BK=/root/backup-before-nextedge; mkdir -p "$BK"
getent hosts "$DOMAIN" | grep -q 187.126.116.161 || { echo "DNS: $DOMAIN does not point here yet."; exit 1; }
cp -a "$CF" "$BK/$(echo "$CF" | tr / _).$(date +%s)"
grep -q "^$DOMAIN" "$CF" && { echo "$DOMAIN already in $CF"; exit 0; }
cat >> "$CF" <<EOF

$DOMAIN {
    request_body {
        max_size 25MB
    }
    handle /api/* {
        reverse_proxy 127.0.0.1:$API_PORT
    }
    handle /iclock/* {
        reverse_proxy 127.0.0.1:$API_PORT
    }
    handle {
        reverse_proxy 127.0.0.1:$ADMIN_PORT
    }
}
EOF
if ! caddy validate --config "$CF" --adapter caddyfile; then cp -a "$BK"/$(echo "$CF" | tr / _).* "$CF" 2>/dev/null; echo "validation failed; restored."; exit 1; fi
systemctl reload caddy && echo "Caddy reloaded."
