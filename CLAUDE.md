# Coaching Connect — build guide for Claude Code

Multi-tenant SaaS for coaching centres: web admin panel + Flutter app for students, parents and faculty.
Full spec: docs/SOW.md (sections 1–15). This file is the short version you must follow.

## What exists (Phase 0 scaffold, all building)
- `apps/api` — NestJS 10 + Drizzle ORM + Postgres. Modules: auth (OTP → JWT), students, batches, attendance, fees, notices. `GET /api/health`.
- `apps/admin` — React 18 + Vite + Tailwind. Pages: Login, Today (dashboard), Students, Batches, Attendance, Fees, Notices.
- `apps/mobile` — Flutter skeleton: OTP login + notices list. Needs `flutter create .` once to generate platform folders.
- `render.yaml` — Blueprint: API + static admin + Postgres + Redis (Singapore region).

## Rules (never break)
1. **Tenant isolation**: every table with centre data has `centre_id`. Every query filters by `centreOf(user)` from `src/common/tenant.ts`. SUPER_ADMIN passes `?centreId=`. Never return another centre's rows.
2. **Auth**: `AuthGuard` is global. Public routes use `@Public()`. Restrict with `@Roles('ADMIN', ...)`. Roles: SUPER_ADMIN, ADMIN, FACULTY, STUDENT, PARENT.
3. **Schema changes** go in `apps/api/src/db/schema.ts`, then `npm run db:push`. Keep enums in schema.ts.
4. **Validation**: class-validator DTOs on every POST/PUT. `whitelist: true` strips unknown fields.
5. **Vendors behind adapters**: SMS/OTP (MSG91), push (FCM), WhatsApp, Razorpay, Agora — each in `src/integrations/<name>.ts` with an interface, env-switchable. OTP_MODE=dev means OTP is 123456.
6. **UI copy**: plain, sentence case, active verbs ("Save attendance" → toast "Attendance saved"). Empty states say what to do next. English + Hindi strings later via i18n; keep strings in one place per page.
7. **Money** is `numeric(10,2)` in DB, string in API, `Number()` only for display. Receipt numbers `R<year>-<00001>`.
8. **Dates**: attendance/fees use `date` (YYYY-MM-DD, IST); timestamps are UTC.
9. Run `npm run build` at repo root before every commit; it must pass.
10. Do not add ad SDKs or analytics that profile minors (DPDP Act 2023).

## Phase 1 — MVP backlog (do in this order)
- [ ] Redis-backed OTP + rate limit (5 OTP/hour/number); BullMQ queue for notifications
- [ ] Students: bulk import from Excel (xlsx upload → preview → confirm), parent user auto-created on add, printable ID card with QR
- [ ] Attendance: QR scan endpoint (`POST /attendance/scan`), parent push on PRESENT/ABSENT, monthly % per student, <75% flag
- [ ] Fees: fee plans assigned to students, due calculation per cycle, Razorpay payment link + webhook, PDF receipt, defaulter list, reminders at −7/−1/0/+7 days
- [ ] Notices: FCM push to audience, seen-by tracking (`notice_reads` table), WhatsApp template fallback after 2h unread
- [ ] Chat: WebSocket gateway (Socket.IO), channels: batch group, student↔faculty, parent↔centre, broadcast; messages table; phone numbers never exposed
- [ ] Study library: `content` table (course/subject/chapter/topic), R2 signed upload/download, per-batch release
- [ ] Faculty & timetable: `faculty_batches`, `timetable_slots` with clash detection
- [ ] Mobile app: role-based home (student: today's classes/notices/attendance; parent: child attendance/fees/notices; faculty: roll call), notices, study library viewer
- [ ] Super-admin console page in admin: list centres, create centre + first admin
- [ ] Seed script covers all of the above; GitHub Actions runs build + API tests

## Phase 2 — Learning (after pilot gate)
Tests (online MCQ + offline marks, rank/percentile, weak-area report), homework (assign/submit/check), live classes (Agora + cloud recording + auto-attendance), parent monthly PDF report, iOS build.

## Phase 3 — Scale
White-label build pipeline (config → app name/icon/package id), OMR scan worker (OpenCV), enquiry CRM, multi-branch, Tally/Excel exports. Launch 20 Apr 2027.

## Local dev
```
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL (local Postgres or Render external URL)
npm install
npm run db:push && npm run db:seed        # demo centre; admin login 9999900001 / OTP 123456
npm run dev:api                           # http://localhost:3000/api/health
npm run dev:admin                         # http://localhost:5173
```
