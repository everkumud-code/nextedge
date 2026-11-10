#!/usr/bin/env bash
# READ-ONLY inspection of a shared VPS. Changes nothing. Output: /root/nextedge-inspect.txt
set -u
OUT=/root/nextedge-inspect.txt
{
echo "== date =="; date -u
echo "== os =="; . /etc/os-release; echo "$PRETTY_NAME"; uname -r
echo "== resources =="; nproc; free -h; df -h / | tail -1; uptime
echo "== top cpu users =="; ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -8
echo "== listening ports (who owns what) =="; ss -ltnp 2>/dev/null
echo "== web servers =="
for s in nginx caddy apache2 httpd traefik; do systemctl is-active "$s" 2>/dev/null | sed "s/^/$s: /"; done
command -v nginx >/dev/null && { nginx -v 2>&1; echo "-- nginx sites-enabled:"; ls -l /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null; echo "-- server_names:"; grep -rhE "^\s*server_name" /etc/nginx 2>/dev/null | sort -u; }
command -v caddy >/dev/null && { caddy version; ls -l /etc/caddy 2>/dev/null; grep -hE "^\S.*\{$" /etc/caddy/Caddyfile 2>/dev/null; }
echo "== docker =="
if command -v docker >/dev/null; then docker --version; docker compose version 2>&1 | head -1; docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'; docker network ls --format '{{.Name}}' | head -20; else echo "docker not installed"; fi
echo "== process managers =="; command -v pm2 >/dev/null && pm2 list 2>/dev/null | head -30; systemctl list-units --type=service --state=running --no-legend 2>/dev/null | awk '{print $1}' | grep -viE "systemd|dbus|ssh|cron|rsyslog|getty|network|udev|polkit|multipathd|snapd|unattended|qemu|chrony|ufw|irqbalance" | head -30
echo "== databases =="; for s in postgresql mysql mariadb mongod redis-server redis; do systemctl is-active "$s" 2>/dev/null | sed "s/^/$s: /"; done
echo "== firewall =="; ufw status 2>/dev/null | head -15
echo "== certificates =="; ls /etc/letsencrypt/live 2>/dev/null; certbot certificates 2>/dev/null | grep -E "Domains|Expiry" | head -20
echo "== cron / timers =="; crontab -l 2>/dev/null | grep -v '^#' ; ls /etc/cron.d 2>/dev/null; systemctl list-timers --no-legend 2>/dev/null | head -8
echo "== sites: status now =="
for d in $(grep -rhoE "^\s*server_name\s+[^;]+" /etc/nginx 2>/dev/null | awk '{for(i=2;i<=NF;i++)print $i}' | grep -vE "^_$|\*" | sort -u); do printf '%s ' "$d"; curl -s -o /dev/null -m 8 -w '%{http_code}\n' -H "Host: $d" http://127.0.0.1/ ; done
echo "== free ports among 3010-3020 =="; for p in $(seq 3010 3020); do ss -ltn "sport = :$p" | grep -q LISTEN || echo -n "$p "; done; echo
} > "$OUT" 2>&1
chmod 600 "$OUT"
echo "Done. Written to $OUT. Send that file's content (it holds no passwords) to Claude."
