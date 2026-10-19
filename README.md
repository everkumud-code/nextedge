# Coaching Connect

White-label app + admin panel for coaching centres (students, parents, faculty, admin). Built by BoomBites / Lazywood.

- `apps/api` — NestJS + Drizzle + Postgres (REST, OTP login, multi-tenant)
- `apps/admin` — React admin panel
- `apps/mobile` — Flutter app
- `docs/SOW.md` — full scope of work
- `CLAUDE.md` — build rules and backlog for Claude Code

## Deploy on Render (one click)
1. Push this repo to GitHub.
2. Render Dashboard → **New → Blueprint** → pick the repo → Apply. `render.yaml` creates the API, admin site, Postgres and Redis.
3. Open the API shell on Render once and run `npm run db:seed` to create the demo centre.
4. Admin panel URL is shown on the `coaching-connect-admin` service. Login: `9999900001`, OTP `123456` (dev mode).

See `SETUP-HINDI.md` for the step-by-step guide in Hindi.
