#!/usr/bin/env bash
# NextSoftwares routing on the VPS (portal + <client>.nextsoftwares.in + the sync job).
#   bash install.sh prepare  <cert-email>     copies files and creates the settings; changes NOTHING that is live (safe to run any time)
#   bash install.sh go-live                   needs the domain's DNS to point here; turns the portal and wildcard on
# Run from the folder that holds this script (deploy/nextsoftwares/bin) as root. Safe to run again.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SRC="$(dirname "$HERE")"
DOMAIN="${DOMAIN:-nextsoftwares.in}"; SERVER_IP="${SERVER_IP:-187.126.116.161}"; ENVF=/etc/nextsoftwares.env
say() { printf '\n==> %s\n' "$*"; }; die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run as root"

prepare() {
  local email="${1:-}"; [ -n "$email" ] || [ -f "$ENVF" ] || die "usage: install.sh prepare <email for certificate notices>"
  say "settings file $ENVF"
  if [ ! -f "$ENVF" ]; then
    umask 077; printf 'DOMAIN=%s\nSERVER_IP=%s\nCERT_EMAIL=%s\nNEXTSOFT_INTERNAL_KEY=%s\n' "$DOMAIN" "$SERVER_IP" "$email" "$(openssl rand -hex 24)" > "$ENVF"; chmod 600 "$ENVF"
  fi
  say "files"
  mkdir -p /var/www/nextsoftwares-portal /var/www/letsencrypt-nextsoftwares /var/lib/nextsoftwares
  chmod 755 /var/www/nextsoftwares-portal /var/www/letsencrypt-nextsoftwares
  sed "s/nextsoftwares\.in/$DOMAIN/g" "$SRC/portal/index.html" > /var/www/nextsoftwares-portal/index.html
  mkdir -p /var/www/nextsoftwares-portal/manual /var/www/nextsoftwares-portal/login /var/www/nextsoftwares-portal/admin; sed "s/nextsoftwares\.in/$DOMAIN/g" "$SRC/portal/admin/index.html" > /var/www/nextsoftwares-portal/admin/index.html; sed "s/nextsoftwares\.in/$DOMAIN/g" "$SRC/portal/login/index.html" > /var/www/nextsoftwares-portal/login/index.html; sed "s/nextsoftwares\.in/$DOMAIN/g" "$SRC/portal/manual/index.html" > /var/www/nextsoftwares-portal/manual/index.html; chmod -R a+rX /var/www/nextsoftwares-portal
  cp "$SRC/nginx/nextsoftwares.conf" /etc/nginx/sites-available/nextsoftwares   # written for nextsoftwares.in; for another domain edit it first
  install -m 755 "$HERE/nsw-sync.py" /usr/local/sbin/nsw-sync.py
  mkdir -p /etc/nginx/snippets; install -m 644 "$SRC/nginx/nsw-workspace.conf" /etc/nginx/snippets/nsw-workspace.conf
  [ -f /etc/nginx/nextsoftwares-hosts.conf ] || printf '# written by nsw-sync.py\n' > /etc/nginx/nextsoftwares-hosts.conf
  cat > /etc/systemd/system/nsw-sync.service <<'UNIT'
[Unit]
Description=NextSoftwares address and certificate sync
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /usr/local/sbin/nsw-sync.py
UNIT
  cat > /etc/systemd/system/nsw-sync.timer <<'UNIT'
[Unit]
Description=Run the NextSoftwares sync every minute
[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
AccuracySec=10s
[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  say "prepared. Nothing is live yet. The shared key for the products is in $ENVF (NEXTSOFT_INTERNAL_KEY)."
}

go_live() {
  [ -f "$ENVF" ] || die "run 'install.sh prepare <email>' first"; . "$ENVF"
  say "checking DNS (it must point here)"
  for h in "$DOMAIN" "www.$DOMAIN" "fit.$DOMAIN" "probe-$RANDOM.$DOMAIN"; do ip="$(dig +short "$h" @1.1.1.1 | tail -1)"; [ "$ip" = "$SERVER_IP" ] || die "$h resolves to '${ip:-nothing}', expected $SERVER_IP. Add the A records @, www and * first."; done
  say "certificate for the portal"
  if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    # a temporary http-only site answers the challenge (the real one needs the certificate that does not exist yet)
    printf 'server { listen 80; listen [::]:80; server_name %s www.%s; location /.well-known/acme-challenge/ { root /var/www/letsencrypt-nextsoftwares; } location / { return 404; } }\n' "$DOMAIN" "$DOMAIN" > /etc/nginx/sites-enabled/nextsoftwares-acme
    nginx -t && systemctl reload nginx
    chmod 755 /var/www/letsencrypt-nextsoftwares   # nginx workers must read the challenge files (prepare runs with umask 077, which made it 700 -> 403)
    certbot certonly --webroot -w /var/www/letsencrypt-nextsoftwares -d "$DOMAIN" -d "www.$DOMAIN" --cert-name "$DOMAIN" --non-interactive --agree-tos -m "$CERT_EMAIL" || { rm -f /etc/nginx/sites-enabled/nextsoftwares-acme; nginx -t && systemctl reload nginx; die "certificate request failed; the temporary site was removed"; }
    rm -f /etc/nginx/sites-enabled/nextsoftwares-acme
  fi
  say "turning the site on"
  ln -sf /etc/nginx/sites-available/nextsoftwares /etc/nginx/sites-enabled/nextsoftwares
  nginx -t || { rm -f /etc/nginx/sites-enabled/nextsoftwares; die "nginx test failed; the site was not enabled"; }
  systemctl reload nginx
  systemctl enable --now nsw-sync.timer; /usr/bin/python3 /usr/local/sbin/nsw-sync.py || true
  say "live: https://www.$DOMAIN . Check: curl -sI https://www.$DOMAIN | head -1"
}

case "${1:-prepare}" in prepare) prepare "${2:-}";; go-live) go_live;; *) die "usage: install.sh prepare <email> | go-live";; esac
