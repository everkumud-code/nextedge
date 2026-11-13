# NextSoftwares: one login page, one address for every client

`www.nextsoftwares.in` is the login page for all products. Every client then has its own address `<client>.nextsoftwares.in`.

| Address | What it is |
|---|---|
| `www.nextsoftwares.in` | login portal: NextEdge, NextFit, NextGlow, NextCare |
| `fit.` / `glow.` / `care.nextsoftwares.in` | the three separate logins (mobile number + OTP) |
| `sharma.nextsoftwares.in` | a school or coaching on **NextEdge** (the page opens with the school already chosen) |
| `irongym.nextsoftwares.in` | a gym, salon or clinic outlet on **NextFit / NextGlow / NextCare** |

NextFit, NextGlow and NextCare are one app with three brands (see `nextbrands`); the outlet's own brand decides how it looks.

## How it works

* Each product knows its own clients: NextEdge stores `centres.slug`, the brands app stores `tenants.slug`. Both refuse reserved names
  (`www`, `fit`, `api`, ...) and both ask the other product before giving an address, so one address is never used twice.
* `bin/nsw-sync.py` (every minute) collects the addresses from both products, issues a Let's Encrypt certificate for each new one,
  writes `/etc/nginx/nextsoftwares-hosts.conf` (one server block per address with a certificate) and reloads nginx if the file changed and
  `nginx -t` passes. A product that is down keeps its last known addresses; a failed config is rolled back.
* `nginx/nextsoftwares.conf` = the portal, the plain-http challenge, and the message for an address with no client.
* Tests: `python -I bin/test_nsw_sync.py` (10), `apps/api` `npx ts-node scripts/workspaces-selftest.ts`, NextServe `node test/workspace.test.js`.

## What the owner must do first (nothing here can be done by code)

1. **Register the domain `nextsoftwares.in`** (on 13 Nov 2026 it did not exist: both public DNS resolvers answer "no such domain").
2. At the domain's DNS add three **A records** pointing to the VPS **187.126.116.161**: `@` (bare domain), `www`, and `*` (wildcard).
   (Wildcard is what makes every new client work without touching DNS again.)

## Install on the VPS (the developer / Claude does this after the owner says go)

```bash
cd deploy/nextsoftwares/bin
sudo bash install.sh prepare you@example.com       # copies files, creates /etc/nextsoftwares.env (shared key); changes nothing live
sudo bash setup-brands.sh /root/nextbrands.tgz 9090770070 "Owner name"      # NextFit/Glow/Care app on 127.0.0.1:4000
# add to /opt/nextedge/.env, then: docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --no-deps api
#   NEXTSOFT_INTERNAL_KEY=<same key as /etc/nextsoftwares.env>
#   WORKSPACE_DOMAIN=nextsoftwares.in
#   OTHER_PRODUCT_CHECK_URLS=http://host.docker.internal:4000/public/workspace/      (NextEdge's compose needs extra_hosts host-gateway)
sudo bash install.sh go-live                        # checks DNS first, then turns on the portal, the wildcard and the timer
```

Existing NextEdge clients get an address automatically the first time the new API starts (`demo-public-school`, ...); the platform team
can change one in **Clients** (the "change" link under the address). Old links stop working when an address changes.

## Not done on purpose

* Real OTP delivery for the brands app needs a provider (MSG91 or a WhatsApp BSP) in its `.env`; until then codes only appear in its log.
* Existing clients' logins at `nextedge.nextresource.in` keep working; the new address is an addition.
