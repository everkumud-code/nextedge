# Moving NextEdge's mobile apps and attendance machines to the NextSoftwares address

New address for everything: **admin.nextsoftwares.in** (apps, machines, API). A school's own address `<school>.nextsoftwares.in` works too.
The old address `nextedge.nextresource.in` keeps answering `/api/` and `/iclock/` so nothing already installed stops working, until you retire it.

## Attendance machines (biometric, ZKTeco-style "cloud server / ADMS")
On the machine's menu (Comm. / Cloud server setting):

| Setting | New value |
|---|---|
| Server address | `admin.nextsoftwares.in` |
| Port | `443` with HTTPS **on** (recommended), or `80` with HTTPS **off** for old machines that cannot do HTTPS |
| Enable domain name | on |
| Proxy | off |

Only `/iclock/` is accepted on plain http (port 80); everything else is forced to https. The device key and serial number in NextEdge stay the same.
Check: after the first punch, NextEdge → Biometric shows the machine as seen. Keep the old server address written down until then, so you can go back.
(At the time of writing, on 13 Nov 2026, no machine had ever connected to the old address: the only request in the server logs was a test from the VPS itself.)

## Mobile apps (Android / iOS)
* The address is inside the app (`apps/mobile/lib/config.dart`, `apiBase`), so an **installed** app cannot be switched from the server. The new default is already `https://admin.nextsoftwares.in/api`.
* Build and publish a new version (Codemagic: the "White-label release" workflow reads `API_BASE`, whose default is now the new address; `apps/api` shows the right value on the Platform page). People update from the store.
* Until they update, the old app keeps working through the old address. Nothing breaks.

## When can the old address be retired?
Run on the VPS: `nextedge-legacy-usage 14` (also in `deploy/nextsoftwares/bin/legacy-usage.sh`). It lists mobile apps and machines that still call the old address
(web browsers and the VPS itself are not counted). When it stays empty for two weeks, make `nextedge.nextresource.in` redirect everything (including `/api/` and `/iclock/`) to `admin.nextsoftwares.in`.
