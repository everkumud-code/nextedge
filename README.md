# NextEdge

White-label app + admin panel for coaching centres (students, parents, faculty, admin). Built by BoomBites / Lazywood.

- `apps/api` — NestJS + Drizzle + Postgres (REST, OTP login, multi-tenant)
- `apps/admin` — React admin panel
- `apps/mobile` — Flutter app
- `docs/SOW.md` — full scope of work
- `CLAUDE.md` — build rules and backlog for Claude Code

## Run it on your own server (Docker)
1. Copy `deploy/.env.example` to `.env` and set `DOMAIN`, `API_DOMAIN`, the database password and `JWT_SECRET`.
2. `docker compose up -d --build` starts the API, the admin panel, Postgres and Redis. On a shared server use `deploy/vps/` (it runs everything on 127.0.0.1 behind nginx).
3. The admin panel is served at your `DOMAIN`. For a demo database set `SEED_ON_BOOT=true` once.

See `SETUP-HINDI.md` for the step-by-step guide in Hindi.
