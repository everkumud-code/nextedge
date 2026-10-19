# Coaching Connect — build guide for Claude Code

Multi-tenant SaaS for coaching centres: web admin panel + Flutter app for students, parents and faculty.
Full spec: docs/SOW.md (sections 1–15). This file is the short version you must follow.

## What exists (Phase 0 scaffold, all building)
- `apps/api` — NestJS 10 + Drizzle ORM + Postgres. Modules: auth (OTP → JWT), students, batches, attendance, fees, notices. `GET /api/health`.
- `apps/admin` — React 18 + Vite + Tailwind. Pages: Login, Today (dashboard), Students, Batches, Attendance, Fees, Notices.
- `apps/mobile` — Flutter skeleton: OTP login + notices list. Needs `flutter create .` once to generate platform folders.
- `render.yaml` — Blueprint: API + static admin + Postgres + Redis (Singapore region).

## Owner
Super-admin for this (and every) project: ever.kumud@gmail.com — seeded as SUPER_ADMIN (mobile 9090770070). Project notifications: boombitesindia@gmail.com.

## Rules (never break)
1. **Tenant isolation**: every table with centre data has `centre_id`. Every query filters by `centreOf(user)` from `src/common/tenant.ts`. SUPER_ADMIN passes `?centreId=`. Never return another centre's rows.
2. **Auth**: login is coaching → mobile → OTP by SMS (MSG91) or email (SMTP, free via Gmail App Password). `GET /auth/centres` is public. `AuthGuard` is global. Public routes use `@Public()`. Restrict with `@Roles('ADMIN', ...)`. Roles: SUPER_ADMIN, ADMIN, FACULTY, STUDENT, PARENT.
3. **Schema changes** go in `apps/api/src/db/schema.ts`, then `npm run db:push`. Keep enums in schema.ts.
4. **Validation**: class-validator DTOs on every POST/PUT. `whitelist: true` strips unknown fields.
5. **Vendors behind adapters**: SMS/OTP (MSG91), push (FCM), WhatsApp, Razorpay, Agora — each in `src/integrations/<name>.ts` with an interface, env-switchable. OTP_MODE=dev means OTP is 123456.
6. **UI copy**: plain, sentence case, active verbs ("Save attendance" → toast "Attendance saved"). Empty states say what to do next. English + Hindi strings later via i18n; keep strings in one place per page.
7. **Money** is `numeric(10,2)` in DB, string in API, `Number()` only for display. Receipt numbers `R<year>-<00001>`.
8. **Dates**: attendance/fees use `date` (YYYY-MM-DD, IST); timestamps are UTC.
9. Run `npm run build` at repo root before every commit; it must pass.
10. Do not add ad SDKs or analytics that profile minors (DPDP Act 2023).

## Phase 1 — MVP backlog (do in this order)
- [x] Redis-backed OTP + rate limit (5 OTP/hour/number) — done; BullMQ queue for notifications pending
- [x] Students: bulk import from Excel (preview → confirm) and parent/student login auto-created — done; printable ID card with QR pending
- [x] Attendance: QR scan endpoint, parent alerts on reached/absent, monthly % with <75% flag — done
- [x] Fees: plans → student assignment, due per cycle, defaulters, reminders endpoint, Razorpay payment link + webhook — done (PDF receipt pending)
- [x] Notices: push to audience with WhatsApp fallback, seen-by report — done (2h delayed fallback pending)
- [x] Chat: Socket.IO gateway `/chat`, rooms batch/parent/staff, history REST, word filter — done (student↔faculty DM pending)
- [x] Study library: content table, R2 signed upload/download, per-batch release, new-notes push — done
- [x] Faculty & timetable with clash detection — done
- [x] Mobile app: role-based homes (student/parent/faculty), study viewer, chat, pay-now link, push token registration — written, NOT yet compiled (no Flutter SDK in the build env): run `flutter pub get && flutter analyze` first and fix anything it reports
- [x] Super-admin API: list centres, create centre + first admin — done (admin UI page pending)
- [ ] Seed script covers all of the above; GitHub Actions runs build + API tests (workflow file needs a token with Workflows permission)

## Phase 2 — Learning
- [x] Tests: online MCQ auto-check (negative marking, chapter weak areas, tab-switch count), offline marks entry, rank/percentile, publish test/results — API + admin + mobile
- [x] Homework: assign, submit (text / file keys), grade + remark, remind pending — API + admin + mobile
- [x] Live classes: Jitsi room per class, start → push, join/leave logging, end → auto-attendance ≥60%, recording link — API + admin + mobile
- [x] PDF receipt (`GET /fees/receipt/:id.pdf`), 2h WhatsApp fallback for unread notices, student↔faculty DM rooms, printable QR ID cards
- [ ] Parent monthly PDF report (attendance, marks, homework) sent on the 1st
- [ ] Agora in-app video (replace Jitsi external link) + cloud recording to R2
- [ ] Homework photo upload from camera (needs S3_* env; API ready: /homework/upload-url)
- [ ] iOS build + TestFlight; Android release build (Codemagic)
- [ ] Flutter: run `flutter create . --org in.boombites --project-name coaching_connect` once, then `flutter analyze` and fix

## Owner / parent / student extras (done)
- [x] Staff & privileges: roles ADMIN (owner, all) / FACULTY / STAFF; `staff_permissions.modules` decides pages; `@Mod('x')` on controllers + `AuthGuard` enforce; admin nav filters by `user.modules`
- [x] Doubt box (student asks, faculty answers, 24h overdue flag), leave requests (approved → LEAVE in attendance), parent feedback/complaints with owner reply, enquiry register with follow-ups and one-click admission
- Admin: Inbox (doubts/leaves/feedback), Enquiries, Staff pages. Mobile: SupportScreen tab for student (Doubts, Leave) and parent (Leave, Feedback, Doubts)

- [x] Announcements: notice types ANNOUNCEMENT/GREETING, `pinned` banner (top of app home), `imageUrl`, `expiresAt`; Wishes page: festival greetings (templates) + auto birthday wish 07:00 IST from `students.dob` + owner-editable template; in-app notification feed (`/notifications/mine`, bell with unread in admin + app)

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
