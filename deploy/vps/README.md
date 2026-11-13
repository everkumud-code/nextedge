# NextEdge on the shared Hostinger VPS (nextedge.nextresource.in)

Runs next to the other sites without touching them: containers listen on 127.0.0.1 only, the existing web server does TLS and routing.

## Order (run as root on the VPS)
1. `bash deploy/vps/1-inspect.sh` — read-only. Send `/root/nextedge-inspect.txt` to Claude (no passwords in it).
2. DNS (GoDaddy): A record `nextedge` -> `187.126.116.161`, TTL 600.
3. `bash deploy/vps/2-deploy-app.sh` — clones to /opt/nextedge, creates `.env` with random secrets (OTP_MODE=none, demo seed on), builds, starts on 127.0.0.1:3010 (api) and :3011 (admin).
4. Vhost, ONE of (whichever server owns 80/443 per the inspect file):
   - nginx: `CERT_EMAIL=you@example.com bash deploy/vps/3-vhost-nginx.sh`
   - caddy: `bash deploy/vps/3-vhost-caddy.sh`
   Both back up what they touch to /root/backup-before-nextedge/, test the config, and reload (never restart).
5. `bash deploy/vps/5-verify.sh`, then log in at https://nextedge.nextresource.in (see DEMO-LOGINS.md).
6. When demo data has filled in: `bash deploy/vps/6-seed-off.sh`.
7. `bash deploy/vps/4-backup.sh` — nightly 03:17 dump to /backups/nextedge, 14 days kept.

## Update / roll back
- Update: `cd /opt/nextedge && git pull && docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build`
- Stop NextEdge only: `docker compose -f docker-compose.yml -f docker-compose.vps.yml down` (data volumes stay).
- Remove the vhost: delete `/etc/nginx/sites-enabled/nextedge.nextresource.in` (or the block in the Caddyfile; originals are in /root/backup-before-nextedge/), test, reload.

## Warnings
- OTP_MODE=none: anyone who knows a centre name and email can log in. Demo only. Switch to a real OTP mode before real customers.
- The Flutter app and its web build use https://nextedge.nextresource.in (set in `apps/mobile/lib/config.dart`).
