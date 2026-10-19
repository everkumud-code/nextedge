# Coaching Centre App — Scope of Work (summary)

Full, editable SOW with diagrams: https://claude.ai/code/artifact/fabb1bea-a996-4190-8872-ff53b727adde

**Product:** one white-label mobile app (Flutter, Android + iOS) + web admin panel + multi-tenant backend, for coaching centres of 50–2,000 students. Roles: Admin/Owner, Faculty, Student, Parent (OTP login; parent ↔ many children).

**Modules**
1. Study / Learning — content library (course > subject > chapter > topic, per-batch release), recordings, question bank, practice mode, doubt box, progress tracker, offline notes, watermarking.
2. Live classes — one-tap start from timetable, Agora/Jitsi, whiteboard, polls, auto-attendance (60% rule), cloud recording to library in 15 min, low-bandwidth mode.
3. Periodic tests — online MCQ (timer, negative marking), online subjective, offline (OMR scan or marks grid); rank, percentile, chapter weak-area report, parent result push, exports.
4. Tasks / homework — assign (batch/group/student), submit photo/PDF/text/MCQ, annotate + grade, reminders, pending lists, completion rate.
5. Notices — audience targeting, 6 types, schedule/pin/expire, push → WhatsApp/SMS fallback, seen-by report, EN/HI templates.
6. Chat — batch group, student↔faculty, parent↔centre, broadcast; moderation, keyword filter, no phone numbers exposed, 12-month retention.
7. Management — admissions + Excel import, batches/timetable with clash detection, attendance (QR/roll call/live), fees (plans, Razorpay, receipts, dues, defaulters), faculty hours, enquiry CRM, reports dashboard, parent monthly PDF.

**Architecture:** Flutter app + React admin → NestJS API on Render (centre_id on every row, JWT + role per call) → Postgres, Redis, Cloudflare R2; external: Agora, Razorpay, Firebase (FCM), MSG91/WhatsApp API. White-label = one binary per centre from a config file; shared backend.

**Non-functional:** Android 9+/iOS 14+, <40 MB, 2 GB RAM phones; home <2 s on 4G; offline notes/timetable; 500 centres / 2 lakh students; 99.5% uptime; DPDP Act 2023, data in India, no ad SDKs; EN + HI UI; audit log on fees/attendance/marks.

**Phases:** P0 Setup (3–14 Nov 2026) → P1 MVP: admin, attendance, fees, notices, chat, study, Android (17 Nov–23 Jan 2027; gate: 1 pilot centre live, 50+ students) → P2 Learning: tests, homework, live classes, parent report, iOS (26 Jan–6 Mar; gate: 2 pilots run full test + fee cycle) → P3 Scale: white-label pipeline, OMR, CRM, WhatsApp fallback, multi-branch (9 Mar–17 Apr) → **Launch 20 Apr 2027**.

**Pricing:** per active student/month — Starter Rs 25, Standard Rs 40 (white-label), Pro Rs 60; min 50 students; usage (WhatsApp/SMS, extra recording, Razorpay fees) at cost + 20%; one-time Rs 15,000 white-label build; 30-day pilot free.

**Out of scope:** content creation, AI tutoring, webcam proctoring, payroll/GST, hardware, marketing site.
