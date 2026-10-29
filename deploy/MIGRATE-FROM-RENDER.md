# Moving NextEdge from Render to your own server (Hostinger VPS)

**The free Render database is deleted on 2026-11-18.** Do step 1 now, whatever you decide later.

## 1. Take a copy of the data today (5 minutes, on your own computer)
Render dashboard → the database → **Connections → External Database URL** (copy it).
```
pg_dump "<External Database URL>" --no-owner --no-acl -Fc -f nextedge.dump
```
(Needs PostgreSQL client tools: `pg_dump` version 16 or newer.) Keep `nextedge.dump` safe.
Extra safety net: in the admin panel, **Clients → Download platform backup** (a readable JSON file of every centre) and each school can use **Subscription → Download backup**.

## 2. Fresh server
Follow `deploy/HOSTINGER-HINDI.md` (Docker + Caddy, `docker compose up -d`). Put the real values in `.env`:
`DOMAIN`, `API_DOMAIN`, `DB_PASSWORD`, `JWT_SECRET` (use the **same** JWT_SECRET as Render so logged-in people are not signed out), `OTP_MODE`, `MSG91_*`.
Optional: `ANTHROPIC_API_KEY` (Ask NextEdge answers about your own data + photo import), `FIREBASE_SERVICE_ACCOUNT_JSON` (or paste it later on the Messaging page).
Set `SEED_ON_BOOT=false` so demo data is not re-created.

## 3. Load the data
```
docker compose up -d db
docker compose cp nextedge.dump db:/tmp/nextedge.dump
docker compose exec db pg_restore -U coaching -d coaching_connect --clean --if-exists --no-owner /tmp/nextedge.dump
docker compose up -d
```
The API creates any missing tables by itself on start (`drizzle-kit push`).

## 4. Point things at the new address
* Phone app: build with the new `API_URL` (see `apps/mobile`), or keep the old address working until the new app is out.
* DNS: `DOMAIN` and `API_DOMAIN` A-records → the server IP.
* Biometric machines: Server address = `API_DOMAIN`, port 443. Machines that cannot do HTTPS: use the server IP and port **8081** (plain HTTP, only `/iclock` is reachable).
* GPS trackers: the address shown in Transport → Live bus → Connect a GPS tracker (it follows `PUBLIC_API_URL`).
* SMS/WhatsApp/payment webhooks: update the callback addresses in MSG91 / Meta / PayU to `https://API_DOMAIN/...`.

## 5. Check
Open `https://API_DOMAIN/api/health`, log in as the super admin, open Clients (counts must match Render), download one centre's backup.
Only after a week of normal use, delete the Render services.

## Backups from now on
Nightly on the server: `docker compose exec -T db pg_dump -U coaching -Fc coaching_connect > /backups/nextedge-$(date +%F).dump` (cron), and copy it off the server (another disk or cloud storage).
