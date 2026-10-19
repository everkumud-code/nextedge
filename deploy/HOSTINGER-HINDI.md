# Hostinger VPS par deploy (Hindi)

**Plan:** Hostinger VPS KVM 2 (Ubuntu 24.04). Shared ya Managed Node.js plan is app ke liye nahi chalega (Postgres/Redis/WebSocket chahiye).

1. hPanel → VPS → OS: Ubuntu 24.04 (plain, bina panel ke) → root password set karein.
2. Domain ke DNS mein do A records VPS ke IP par: `app.<domain>` aur `api.<domain>`.
3. Code GitHub par ho (repo link chahiye). hPanel → VPS → **Browser terminal** kholein aur yeh ek line paste karein:

```
curl -fsSL https://raw.githubusercontent.com/<org>/coaching-connect/main/deploy/install.sh -o install.sh && bash install.sh https://github.com/<org>/coaching-connect.git app.<domain> api.<domain>
```
(private repo ho to `https://<token>@github.com/...` format mein link dein)

4. 5–10 minute mein HTTPS ke saath live: `https://app.<domain>` — login `9999900001`, OTP `123456`.
5. Asli SMS ke liye `/opt/coaching-connect/.env` mein `OTP_MODE=msg91` + keys daal kar `docker compose up -d --build`.

**Update:** `cd /opt/coaching-connect && git pull && docker compose up -d --build`
