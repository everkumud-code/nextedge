import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { auditLog, batches, centreSettings, centres, facultyBatches, platformSettings, staffPermissions, students, subscriptionInvoices, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { MODULES } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { PLAN_PRESETS, PlatformService } from './platform.service';
import { SMTP_PRESETS, verifySmtp, sendEmailVia } from '../integrations/email';
import { MailService } from '../notifications/mail.service';
import { featuresFor } from '../common/permissions';

/** Super-admin console: per-centre features, plan, billing, provider. */
@Controller('platform')
@Roles('SUPER_ADMIN')
export class PlatformController {
  constructor(private dbs: DbService, private svc: PlatformService, private mail: MailService) {}

  @Get('modules') modules() { return MODULES; }
  /** Super-admin mailbox (Gmail App Password) + OTP switch, managed from the Platform page. */
  @Get('email-status') async emailStatus() { const p = await this.mail.platform(); const box = await this.mail.platformMailbox(); return { configured: !!box, from: box?.from || null, user: p?.smtpUser || process.env.PLATFORM_SMTP_USER || null, verifiedAt: p?.smtpVerifiedAt || null, otpEnabled: await this.mail.otpEnabled(), otpModeEnv: (process.env.OTP_MODE || '').trim() || null, presets: SMTP_PRESETS }; }
  @Put('email') async setEmail(@Body() b: { provider: string; host?: string; port?: number; user: string; pass: string; fromName?: string; testTo?: string }) {
    const preset = SMTP_PRESETS[b.provider] || SMTP_PRESETS.gmail; const host = b.host || preset.host; const port = Number(b.port || preset.port);
    if (!host || !b.user || !b.pass) return { ok: false, error: 'Email and app password are required' };
    const smtp = { host, port, user: b.user.trim(), pass: b.pass.replace(/\s+/g, ''), from: `${b.fromName || 'NextEdge'} <${b.user.trim()}>` };
    try { await verifySmtp(smtp); await sendEmailVia(smtp, b.testTo || b.user, 'NextEdge: platform mailbox connected', 'Super-admin mails, invoices, renewals and fallback OTPs will go from this mailbox.'); }
    catch (e: any) { return { ok: false, error: `Could not connect: ${e.message}. ${preset.note} (Hosting that blocks SMTP, such as Render free, times out here.)` }; }
    await this.mail.platform();
    await this.dbs.db.update(platformSettings).set({ smtpHost: host, smtpPort: port, smtpUser: smtp.user, smtpPass: smtp.pass, smtpFrom: smtp.from, smtpVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(platformSettings.id, 'platform'));
    this.mail.invalidate(); return { ok: true };
  }
  @Put('otp') async setOtp(@Body() b: { enabled: boolean }) {
    if (b.enabled && !(await this.mail.platformMailbox())) return { ok: false, error: 'Connect the platform mailbox first, so OTPs have a way to go out.' };
    await this.mail.platform(); await this.dbs.db.update(platformSettings).set({ otpEnabled: !!b.enabled, updatedAt: new Date() }).where(eq(platformSettings.id, 'platform')); this.mail.invalidate();
    return { ok: true, otpEnabled: await this.mail.otpEnabled(), note: (process.env.OTP_MODE || '').trim() ? `Server env OTP_MODE=${process.env.OTP_MODE} overrides this switch - clear it to use the switch.` : undefined };
  }
  @Post('email-test') async emailTest(@Body() b: { to: string }) { try { const ok = await sendEmailVia(await this.mail.platformMailbox(), b.to, 'NextEdge platform email test', 'Platform mailbox is working.'); return { ok }; } catch (e: any) { return { ok: false, error: e.message }; } }
  @Get('plans') plans() { return PLAN_PRESETS; }

  /** All centres with settings, student count, open invoice. */
  @Get('centres') async list() {
    const db = this.dbs.db; const rows = await db.select().from(centres).orderBy(centres.name); const out = [];
    for (const c of rows) { const s = await this.svc.settings(c.id); const n = await this.svc.activeStudents(c.id);
      const [inv] = await db.select().from(subscriptionInvoices).where(and(eq(subscriptionInvoices.centreId, c.id), eq(subscriptionInvoices.status, 'due')));
      const [ow] = await db.select({ id: users.id, name: users.name, email: users.email, mobile: users.mobile }).from(users).where(and(eq(users.centreId, c.id), eq(users.role, 'ADMIN'))).orderBy(users.createdAt).limit(1);
      out.push({ ...c, settings: s, activeStudents: n, openInvoice: inv || null, owner: ow || null }); }
    return out;
  }

  @Put('centres/:id/settings') async update(@Param('id') id: string, @Body() b: Partial<{ features: string[]; pricePerStudent: number; minStudents: number; billingCycle: string; plan: string; status: string; paidUntil: string; trialEndsAt: string; liveProvider: string; zoomAccountId: string; zoomClientId: string; zoomClientSecret: string; defaultMeetingUrl: string }>) {
    const db = this.dbs.db; await this.svc.settings(id); const set: any = { updatedAt: new Date() };
    if (b.plan && PLAN_PRESETS[b.plan]) { await db.update(centres).set({ plan: b.plan }).where(eq(centres.id, id)); set.pricePerStudent = String(PLAN_PRESETS[b.plan].price); set.features = JSON.stringify(PLAN_PRESETS[b.plan].features); }
    if (b.features) set.features = JSON.stringify(b.features.filter((m) => (MODULES as readonly string[]).includes(m)));
    if (b.pricePerStudent !== undefined) set.pricePerStudent = String(b.pricePerStudent);
    for (const k of ['minStudents', 'billingCycle', 'status', 'paidUntil', 'trialEndsAt', 'liveProvider', 'zoomAccountId', 'zoomClientId', 'zoomClientSecret', 'defaultMeetingUrl', 'appName', 'packageId', 'appColour', 'appLogoUrl', 'appIconUrl', 'playStoreUrl'] as const) if ((b as any)[k] !== undefined) set[k] = (b as any)[k];
    await db.update(centreSettings).set(set).where(eq(centreSettings.centreId, id));
    return this.svc.settings(id);
  }

  /** Build config for the white-label app of this centre (used by the Codemagic 'whitelabel' workflow env vars). */
  @Get('centres/:id/app-config') async appConfig(@Param('id') id: string) {
    const s = await this.svc.settings(id); const [c] = await this.dbs.db.select().from(centres).where(eq(centres.id, id));
    const slug = (c.name || 'nextedge').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'nextedge';
    return { CENTRE_ID: id, APP_NAME: s.appName || c.name, PACKAGE_ID: s.packageId || `in.nextedge.${slug}`, APP_COLOUR: s.appColour || c.primaryColour || '#1673D9', APP_LOGO_URL: s.appLogoUrl || '', APP_ICON_URL: s.appIconUrl || s.appLogoUrl || '', API_BASE: (process.env.PUBLIC_API_URL || 'https://coaching-connect-api.onrender.com') + '/api', note: 'Codemagic → coaching-connect → workflow "White-label release" → Start new build → set these as environment variables (or add them to the Codemagic app’s environment group for this client).' };
  }

  /** Edit a client: name, city and the owner's login details. */
  @Put('centres/:id/info') async info(@Param('id') id: string, @Body() b: { name?: string; city?: string; ownerName?: string; ownerEmail?: string; ownerMobile?: string }) {
    const db = this.dbs.db; const set: any = {}; if (b.name?.trim()) set.name = b.name.trim(); if (b.city !== undefined) set.city = b.city || null; if (Object.keys(set).length) await db.update(centres).set(set).where(eq(centres.id, id));
    const [ow] = await db.select().from(users).where(and(eq(users.centreId, id), eq(users.role, 'ADMIN'))).orderBy(users.createdAt).limit(1);
    if (ow) { const u: any = {}; if (b.ownerName?.trim()) u.name = b.ownerName.trim(); if (b.ownerEmail !== undefined) { const em = b.ownerEmail.trim().toLowerCase(); if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return { ok: false, error: 'Owner email is not valid' }; u.email = em || null; } if (b.ownerMobile) { const m = b.ownerMobile.replace(/\D/g, '').slice(-10); if (m.length !== 10) return { ok: false, error: 'Owner mobile must be 10 digits' }; u.mobile = m; } if (Object.keys(u).length) await db.update(users).set(u).where(eq(users.id, ow.id)); }
    return { ok: true };
  }
  /** Remote support: every student and every teacher/staff member of a client, in one call. Each view is written to the audit log. */
  @Get('centres/:id/people') async people(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const db = this.dbs.db; const bs = await db.select().from(batches).where(eq(batches.centreId, id)); const bn = (bid: string | null) => bs.find((b) => b.id === bid);
    const sts = await db.select().from(students).where(eq(students.centreId, id)).orderBy(students.name);
    const staff = await db.select({ id: users.id, name: users.name, role: users.role, mobile: users.mobile, email: users.email }).from(users).where(and(eq(users.centreId, id), inArray(users.role, ['ADMIN', 'FACULTY', 'STAFF'])));
    const perms = await db.select().from(staffPermissions).where(eq(staffPermissions.centreId, id)); const fb = await db.select({ facultyId: facultyBatches.facultyId, batchId: facultyBatches.batchId, subject: facultyBatches.subject }).from(facultyBatches).where(eq(facultyBatches.centreId, id));
    await db.insert(auditLog).values({ centreId: id, userId: u.id, userName: u.name, method: 'VIEW', path: '/platform/people (students and teachers list)' }).catch(() => {});
    return {
      students: sts.map((x) => ({ id: x.id, name: x.name, rollNo: x.rollNo, admissionNo: x.admissionNo, className: bn(x.batchId)?.className || x.className, section: bn(x.batchId)?.section, batch: bn(x.batchId)?.name || null, gender: x.gender, dob: x.dob, parentName: x.parentName || x.fatherName, parentMobile: x.parentMobile, address: x.address, active: x.active, hasLogin: !!x.userId })),
      staff: staff.map((x) => { const p = perms.find((q) => q.userId === x.id); return { ...x, title: p?.title || null, active: p ? p.active : true, modules: p ? (JSON.parse(p.modules) as string[]).length : null, classTeacherOf: bs.filter((b) => b.classTeacherId === x.id).map((b) => b.name), teaches: fb.filter((f) => f.facultyId === x.id).map((f) => `${bn(f.batchId)?.name || ''}${f.subject ? ' · ' + f.subject : ''}`) }; }).sort((a, b) => (a.role === 'ADMIN' ? -1 : 0) - (b.role === 'ADMIN' ? -1 : 0) || a.name.localeCompare(b.name)),
    };
  }

  // ---------- Removing clients (everything of theirs is deleted: students, staff, fees, marks, chats, files list …) ----------
  private async fkGraph() {
    const r: any = await this.dbs.db.execute(sql`select conrelid::regclass::text as child, a.attname as child_col, confrelid::regclass::text as parent, af.attname as parent_col, a.attnotnull as notnull from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1] join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1] where c.contype = 'f' and array_length(c.conkey, 1) = 1`);
    return (r.rows || r) as { child: string; child_col: string; parent: string; parent_col: string; notnull: boolean }[];
  }
  private async purgeCentre(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException('Bad id');
    const fks = await this.fkGraph(); const tr: any = await this.dbs.db.execute(sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'centre_id'`); const tables: string[] = (tr.rows || tr).map((x: any) => x.table_name);
    await this.dbs.db.transaction(async (tx: any) => {
      const del = async (table: string, where: string, path: string[]) => {
        for (const fk of fks.filter((f) => f.parent === table)) {
          const sub = `${fk.child_col} in (select ${fk.parent_col} from ${table} where ${where})`;
          if (path.includes(fk.child)) { if (!fk.notnull) await tx.execute(sql.raw(`update ${fk.child} set ${fk.child_col} = null where ${sub}`)); continue; }
          await del(fk.child, sub, [...path, table]);
        }
        await tx.execute(sql.raw(`delete from ${table} where ${where}`));
      };
      for (const t of tables) if (t !== 'centres') await del(`"${t}"`.replace(/^"(.*)"$/, (m, n) => (/^[a-z_]+$/.test(n) ? n : m)), `centre_id = '${id}'`, []);
      await del('centres', `id = '${id}'`, []);
    });
  }
  /** Remove one client. The caller must type the exact name. */
  @Post('centres/:id/delete') async removeCentre(@Param('id') id: string, @Body() b: { confirmName?: string }) {
    const db = this.dbs.db; const [c] = await db.select().from(centres).where(eq(centres.id, id)); if (!c) throw new BadRequestException('No such client');
    if ((b.confirmName || '').trim().toLowerCase() !== c.name.trim().toLowerCase()) throw new BadRequestException('Type the exact name of the client to confirm');
    const [plat] = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, id), inArray(users.role, ['SUPER_ADMIN', 'EXPERT']))).limit(1); if (plat) throw new BadRequestException('This centre holds platform accounts and cannot be deleted');
    await this.purgeCentre(id); return { ok: true, deleted: c.name };
  }
  /** Remove every client whose name does not start with "Demo". dryRun=true only lists them. Real run needs confirm: "DELETE". */
  @Post('centres/purge-non-demo') async purgeNonDemo(@Body() b: { dryRun?: boolean; confirm?: string }) {
    const db = this.dbs.db; const all = await db.select().from(centres); const victims = all.filter((c) => !/^\s*demo\b/i.test(c.name));
    const info = await Promise.all(victims.map(async (c) => { const [n] = await db.select({ n: sql<number>`count(*)` }).from(students).where(eq(students.centreId, c.id)); const [ow] = await db.select({ email: users.email, name: users.name }).from(users).where(and(eq(users.centreId, c.id), eq(users.role, 'ADMIN'))).orderBy(users.createdAt).limit(1); return { id: c.id, name: c.name, type: (c as any).institutionType || 'coaching', students: Number(n.n), owner: ow?.name ? `${ow.name} · ${ow.email || ''}` : '' }; }));
    if (b.dryRun || b.confirm !== 'DELETE') return { dryRun: true, kept: all.filter((c) => /^\s*demo\b/i.test(c.name)).map((c) => c.name), willDelete: info };
    const done: string[] = []; for (const v of info) { await this.purgeCentre(v.id); done.push(v.name); }
    return { dryRun: false, deleted: done };
  }

  /** What the platform team did inside this centre (changes only). */
  @Get('centres/:id/audit') audit(@Param('id') id: string) { return this.dbs.db.select().from(auditLog).where(eq(auditLog.centreId, id)).orderBy(desc(auditLog.at)).limit(100); }

  /** Switch a centre between coaching and school; optionally re-apply that type's module set. */
  @Put('centres/:id/type') async setType(@Param('id') id: string, @Body() b: { type: 'coaching' | 'school'; applyFeatures?: boolean }) {
    const type = b.type === 'school' ? 'school' : 'coaching'; await this.dbs.db.update(centres).set({ institutionType: type }).where(eq(centres.id, id));
    if (b.applyFeatures) { await this.svc.settings(id); await this.dbs.db.update(centreSettings).set({ features: JSON.stringify(featuresFor(type)), updatedAt: new Date() }).where(eq(centreSettings.centreId, id)); }
    return { ok: true, type };
  }

  @Get('centres/:id/invoices') invoices(@Param('id') id: string) { return this.dbs.db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.centreId, id)).orderBy(desc(subscriptionInvoices.createdAt)); }
  @Post('centres/:id/invoice') raise(@Param('id') id: string) { return this.svc.raiseInvoice(id); }
  @Post('invoices/:id/paid') paid(@Param('id') id: string, @Body() b: { mode: string; reference?: string }) { return this.svc.markPaid(id, b.mode || 'manual', b.reference); }
  @Post('invoices/:id/void') async voidInv(@Param('id') id: string) { await this.dbs.db.update(subscriptionInvoices).set({ status: 'void' }).where(eq(subscriptionInvoices.id, id)); return { ok: true }; }

  /** Revenue overview. */
  @Get('summary') async summary() {
    const db = this.dbs.db;
    const [{ centresN }] = await db.select({ centresN: sql<number>`count(*)` }).from(centres);
    const [{ studentsN }] = await db.select({ studentsN: sql<number>`count(*)` }).from(students).where(eq(students.active, true));
    const [m] = await db.select({ paid: sql<string>`coalesce(sum(${subscriptionInvoices.amount}) filter (where ${subscriptionInvoices.status} = 'paid' and date_trunc('month', ${subscriptionInvoices.paidOn}) = date_trunc('month', current_date)), 0)`, due: sql<string>`coalesce(sum(${subscriptionInvoices.amount}) filter (where ${subscriptionInvoices.status} = 'due'), 0)` }).from(subscriptionInvoices);
    const st = await db.select({ status: centreSettings.status, n: sql<number>`count(*)` }).from(centreSettings).groupBy(centreSettings.status);
    return { centres: Number(centresN), activeStudents: Number(studentsN), collectedThisMonth: Number(m.paid), outstanding: Number(m.due), byStatus: Object.fromEntries(st.map((x) => [x.status, Number(x.n)])) };
  }
}

/** What a centre's own admin can see about their subscription (read-only + pay link). */
@Controller('subscription')
export class SubscriptionController {
  constructor(private dbs: DbService, private svc: PlatformService, private mail: MailService) {}

  @Get('email-presets') presets() { return SMTP_PRESETS; }
  /** Owner: changes the NextEdge support team made in my centre. */
  @Get('audit') @Roles('ADMIN') audit(@CurrentUser() u: JwtUser) { return this.dbs.db.select().from(auditLog).where(eq(auditLog.centreId, u.centreId!)).orderBy(desc(auditLog.at)).limit(50); }
  /** Owner: school profile used on certificates and report cards. */
  @Put('profile') @Roles('ADMIN') async setProfile(@CurrentUser() u: JwtUser, @Body() b: { academicSession?: string; board?: string; udiseCode?: string; affiliationNo?: string; principalName?: string; address?: string; phone?: string; website?: string }) {
    await this.svc.settings(u.centreId!); const set: any = { updatedAt: new Date() }; for (const k of ['academicSession', 'board', 'udiseCode', 'affiliationNo', 'principalName', 'address', 'phone', 'website'] as const) if ((b as any)[k] !== undefined) set[k] = (b as any)[k] || null;
    await this.dbs.db.update(centreSettings).set(set).where(eq(centreSettings.centreId, u.centreId!)); return { ok: true };
  }
  /** Owner's own mailbox: tests the login, sends a test mail to the owner, saves on success. */
  @Put('email') @Roles('ADMIN') async setEmail(@CurrentUser() u: JwtUser, @Body() b: { provider: string; host?: string; port?: number; user: string; pass: string; fromName?: string; testTo?: string }) {
    const preset = SMTP_PRESETS[b.provider] || SMTP_PRESETS.custom; const host = b.host || preset.host; const port = Number(b.port || preset.port);
    if (!host || !b.user || !b.pass) return { ok: false, error: 'Email, password and provider are required' };
    const smtp = { host, port, user: b.user.trim(), pass: b.pass.replace(/\s+/g, ''), from: `${b.fromName || 'Coaching'} <${b.user.trim()}>` };
    try { await verifySmtp(smtp); await sendEmailVia(smtp, b.testTo || b.user, 'NextEdge: email connected ✅', 'Your coaching’s emails (OTPs, notices, receipts) will now be sent from this mailbox.'); }
    catch (e: any) { return { ok: false, error: `Could not connect: ${e.message}. ${preset.note}` }; }
    await this.svc.settings(u.centreId!);
    await this.dbs.db.update(centreSettings).set({ smtpHost: host, smtpPort: port, smtpUser: smtp.user, smtpPass: smtp.pass, smtpFrom: smtp.from, smtpVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(centreSettings.centreId, u.centreId!));
    return { ok: true };
  }
  @Put('email/remove') @Roles('ADMIN') async removeEmail(@CurrentUser() u: JwtUser) { await this.dbs.db.update(centreSettings).set({ smtpHost: null, smtpPort: null, smtpUser: null, smtpPass: null, smtpFrom: null, smtpVerifiedAt: null }).where(eq(centreSettings.centreId, u.centreId!)); return { ok: true }; }
  @Get() async mine(@CurrentUser() u: JwtUser) {
    if (!u.centreId) return null; const s = await this.svc.settings(u.centreId); const n = await this.svc.activeStudents(u.centreId);
    const [inv] = await this.dbs.db.select().from(subscriptionInvoices).where(and(eq(subscriptionInvoices.centreId, u.centreId), eq(subscriptionInvoices.status, 'due')));
    const { zoomClientSecret, zoomClientId, zoomAccountId, smtpPass, payuSalt, ...safe } = s as any;
    return { ...safe, activeStudents: n, openInvoice: inv || null, estimateNext: Math.max(s.minStudents, n) * Number(s.pricePerStudent) * (s.billingCycle === 'annual' ? 10 : 1) };
  }
  @Post('invoice') @Roles('ADMIN') async raise(@CurrentUser() u: JwtUser) { return this.svc.raiseInvoice(u.centreId!); }
  /** Owner picks how live classes run: jitsi | zoom (needs Zoom S2S keys) | meet | teams | custom (standing link). */
  @Put('live-provider') @Roles('ADMIN') async provider(@CurrentUser() u: JwtUser, @Body() b: { liveProvider: string; zoomAccountId?: string; zoomClientId?: string; zoomClientSecret?: string; defaultMeetingUrl?: string }) {
    await this.svc.settings(u.centreId!); const set: any = { liveProvider: b.liveProvider, updatedAt: new Date() };
    for (const k of ['zoomAccountId', 'zoomClientId', 'zoomClientSecret', 'defaultMeetingUrl'] as const) if (b[k] !== undefined) set[k] = b[k] || null;
    await this.dbs.db.update(centreSettings).set(set).where(eq(centreSettings.centreId, u.centreId!)); return { ok: true };
  }
}
