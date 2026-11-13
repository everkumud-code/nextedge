import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull, or, ilike } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centres, platformTeam, staffPermissions, users } from '../db/schema';
import { FACULTY_DEFAULT, MODULES } from '../common/permissions';
import { PlatformService } from '../platform/platform.service';
import { RedisService } from '../common/redis.service';
import { MailService } from '../notifications/mail.service';
import { MessagingService } from '../messaging/messaging.service';
import { dashKind, type DashKind } from '../dashboard/dash-kind';
import type { JwtUser } from '../common/current-user.decorator';

const OTP_TTL = 5 * 60, SEND_LIMIT = 5, VERIFY_LIMIT = 5;
type Account = { id: string; name: string; role: any; centreId: string | null; email: string | null; mobile: string };

/** Login = choose coaching → mobile → OTP by SMS or email. OTP_MODE=dev → OTP is always 123456. */
@Injectable()
export class AuthService {
  constructor(private dbs: DbService, private jwt: JwtService, private redis: RedisService, private platform: PlatformService, private mail: MailService, private msg: MessagingService) {}

  /** Public list for the login screen. */
  async centres(q?: string) {
    const rows = await this.dbs.db.select({ id: centres.id, name: centres.name, city: centres.city }).from(centres).where(q ? ilike(centres.name, `%${q}%`) : undefined).orderBy(centres.name).limit(50);
    return rows;
  }

  /** Resolves a typed coaching name to a centre id ('platform' for the super-admin). Exact match first, then a unique partial match. */
  async resolveCentre(name?: string, centreId?: string): Promise<string | undefined> {
    if (centreId) return centreId; if (!name) return undefined; const n = name.trim(); if (!n) return undefined;
    if (/^platform/i.test(n)) return 'platform';
    const exact = await this.dbs.db.select({ id: centres.id }).from(centres).where(ilike(centres.name, n)); if (exact.length === 1) return exact[0].id;
    const partial = await this.dbs.db.select({ id: centres.id, name: centres.name }).from(centres).where(ilike(centres.name, `%${n}%`)).limit(5);
    if (partial.length === 1) return partial[0].id;
    if (partial.length > 1) throw new HttpException(`More than one coaching matches "${n}": ${partial.map((p) => p.name).join(', ')}. Type the full name.`, 400);
    throw new HttpException(`No coaching named "${n}". Check the spelling with your centre.`, 404);
  }

  /** Finds the account by email (preferred) or mobile in this centre (centreId 'platform' = super admin). */
  private async account(centreId: string | undefined, mobile?: string, email?: string): Promise<Account | null> {
    const ident = email ? eq(users.email, email.trim().toLowerCase()) : eq(users.mobile, mobile || '');
    const where = centreId === 'platform' ? and(ident, isNull(users.centreId)) : centreId ? and(ident, eq(users.centreId, centreId)) : ident;
    const [u] = await this.dbs.db.select({ id: users.id, name: users.name, role: users.role, centreId: users.centreId, email: users.email, mobile: users.mobile }).from(users).where(where).limit(1);
    return u || null;
  }

  async sendOtp(mobile: string | undefined, centreId?: string, channel?: 'sms' | 'email' | 'whatsapp', email?: string) {
    const acct = await this.account(centreId, mobile, email);
    if (!acct) throw new UnauthorizedException(email ? 'This email is not registered at this coaching. Ask the centre to add it to your profile.' : 'This mobile number is not registered at this coaching.');
    if (!channel) channel = email || acct.email ? 'email' : 'sms';
    if (channel === 'email' && !acct.email) throw new HttpException('No email on record. Ask the centre to add your email.', 400);
    const ident = (email || mobile || '').toLowerCase(); const key = `${centreId || 'any'}:${ident}`;
    // OTP_MODE=none: OTP system switched off — coaching + email logs straight in (demo only).
    if (!(await this.mail.otpEnabled())) return { sent: true, via: 'none', ...(await this.issue(acct)) };
    const sends = await this.redis.hit(`otp:sends:${key}`, 3600);
    if (sends > SEND_LIMIT) throw new HttpException('Too many OTP requests. Try again after an hour.', 429);
    const code = (process.env.OTP_MODE || '').trim() === 'dev' ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
    await this.redis.set(`otp:code:${key}`, code, OTP_TTL); await this.redis.del(`otp:fails:${key}`);
    let delivered = 'dev';
    if (process.env.OTP_MODE !== 'dev') {
      const text = `${code} is your login OTP for NextEdge. Valid for 5 minutes. Do not share it.`; const fail = async (why: string) => { await this.redis.del(`otp:code:${key}`); throw new HttpException(why, 502); };
      if (channel === 'email') { const r = await this.msg.sendEmail(acct.centreId, acct.email!, `${code} is your login OTP`, `Your login OTP is ${code}. It is valid for 5 minutes.`, 'otp'); if (!r.sent) return fail(`Could not email the OTP (${r.reason}). Try SMS or WhatsApp, or ask the centre to check the mailbox settings.`); delivered = 'email'; }
      else if (channel === 'whatsapp') { const r = await this.msg.sendWhatsApp(acct.centreId, acct.mobile, 'otp', { code, text }); if (!r.sent) return fail(`Could not send the WhatsApp OTP (${r.reason}). Try email or SMS.`); delivered = 'whatsapp'; }
      else { const r = await this.msg.sendSms(acct.centreId, acct.mobile, 'otp', { code, text }); if (!r.sent) { if (acct.email) { const e = await this.msg.sendEmail(acct.centreId, acct.email, `${code} is your login OTP`, `Your login OTP is ${code}. It is valid for 5 minutes. (SMS could not be sent.)`, 'otp'); if (!e.sent) return fail(`Could not send the OTP by SMS (${r.reason}) or email.`); delivered = 'email'; } else return fail(`Could not send the SMS OTP (${r.reason}).`); } else delivered = 'sms'; }
    }
    const mask = (e?: string | null) => e ? e.replace(/^(.{2}).*(@.*)$/, '$1***$2') : undefined;
    return { sent: true, via: delivered, to: delivered === 'email' ? mask(acct.email) : delivered === 'sms' || delivered === 'whatsapp' ? `******${acct.mobile.slice(-4)}` : undefined, expiresIn: OTP_TTL, devHint: process.env.OTP_MODE === 'dev' ? '123456' : undefined };
  }

  async verifyOtp(mobile: string | undefined, code: string, centreId?: string, email?: string) {
    const ident = (email || mobile || '').toLowerCase(); const key = `${centreId || 'any'}:${ident}`;
    const stored = await this.redis.get(`otp:code:${key}`);
    if (!stored) throw new UnauthorizedException('OTP expired. Request a new one.');
    if (stored !== code) { const fails = await this.redis.hit(`otp:fails:${key}`, OTP_TTL); if (fails >= VERIFY_LIMIT) { await this.redis.del(`otp:code:${key}`); throw new UnauthorizedException('Too many wrong attempts. Request a new OTP.'); } throw new UnauthorizedException(`Wrong OTP. ${VERIFY_LIMIT - fails} attempts left.`); }
    await this.redis.del(`otp:code:${key}`);
    if (centreId || email) { const acct = await this.account(centreId, mobile, email); if (!acct) throw new UnauthorizedException('Account not found'); return this.issue(acct); }
    // No centre given (older app): fall back to the chooser when the number exists in several places.
    const accounts = await this.dbs.db.select({ id: users.id, name: users.name, role: users.role, centreId: users.centreId, centreName: centres.name }).from(users).leftJoin(centres, eq(centres.id, users.centreId)).where(eq(users.mobile, mobile || ''));
    if (!accounts.length) throw new UnauthorizedException('This mobile number is not registered');
    if (accounts.length === 1) return this.issue(accounts[0]);
    const choice = await this.jwt.signAsync({ mobile, choose: true }, { expiresIn: '10m' });
    return { choose: true, choiceToken: choice, options: accounts.map((a) => ({ userId: a.id, role: a.role, name: a.name, centreName: a.centreName || 'Platform' })) };
  }

  async choose(choiceToken: string, userId: string) {
    let payload: any; try { payload = await this.jwt.verifyAsync(choiceToken); } catch { throw new UnauthorizedException('Choice expired, log in again'); }
    if (!payload?.choose) throw new UnauthorizedException('Invalid token');
    const [u] = await this.dbs.db.select().from(users).where(and(eq(users.id, userId), eq(users.mobile, payload.mobile)));
    if (!u) throw new UnauthorizedException('Account not found'); return this.issue(u);
  }

  private async issue(user: { id: string; name: string; role: any; centreId: string | null }, demoFrom?: string) {
    let modules: string[] = [];
    if (user.role === 'SUPER_ADMIN') { const [t] = await this.dbs.db.select().from(platformTeam).where(eq(platformTeam.userId, user.id)); if (t && !t.active) throw new UnauthorizedException('Your account is deactivated. Contact the platform owner.'); }
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      modules = [...MODULES];
      if (user.role === 'ADMIN') { const [p] = await this.dbs.db.select().from(staffPermissions).where(eq(staffPermissions.userId, user.id)); if (p && !p.active) throw new UnauthorizedException('Your account is deactivated. Contact the owner.'); }
    }
    else if (user.role === 'FACULTY' || user.role === 'STAFF') {
      const [p] = await this.dbs.db.select().from(staffPermissions).where(eq(staffPermissions.userId, user.id));
      if (p && !p.active) throw new UnauthorizedException('Your staff account is deactivated. Contact the owner.');
      modules = p ? JSON.parse(p.modules) : user.role === 'FACULTY' ? FACULTY_DEFAULT : [];
    }
    let features: string[] = [...MODULES], status = 'active', institutionType = 'coaching', centreName = '';
    if (user.centreId) { const [ce] = await this.dbs.db.select({ t: centres.institutionType, n: centres.name }).from(centres).where(eq(centres.id, user.centreId)); institutionType = ce?.t || 'coaching'; centreName = ce?.n || ''; const s = await this.platform.settings(user.centreId); features = s.features.length ? s.features : [...MODULES]; status = s.status; modules = modules.filter((m) => features.includes(m)); }
    const token = await this.jwt.signAsync({ id: user.id, role: user.role, centreId: user.centreId, name: user.name, modules, ...(demoFrom ? { demoFrom } : {}) }, demoFrom ? { expiresIn: '12h' } : undefined); // a demo view never lasts longer than half a day
    return { token, user: { id: user.id, name: user.name, role: user.role, centreId: user.centreId, modules, features, subscriptionStatus: status, institutionType, centreName, ...(demoFrom ? { demoFrom } : {}) } };
  }

  // ---------- DEMO ONLY: look at the demo through each person's login (no OTP) ----------
  /** The demo centre this person may look around in, or null. Allowed: the platform team (inside a demo centre), a sales-demo staff member of that centre, and anyone who got here through this switch. Real centres can never be entered this way. */
  async demoCentre(u: JwtUser): Promise<string | null> {
    if (!u.centreId) return null; const [ce] = await this.dbs.db.select({ plan: centres.plan }).from(centres).where(eq(centres.id, u.centreId)); if (ce?.plan !== 'demo') return null;
    if (u.role === 'SUPER_ADMIN' || u.demoFrom) return u.centreId;
    if (u.role === 'STAFF') { const [p] = await this.dbs.db.select({ t: staffPermissions.title }).from(staffPermissions).where(eq(staffPermissions.userId, u.id)); if (String(p?.t || '').toLowerCase() === 'sales demo') return u.centreId; }
    return null;
  }
  private static LABEL: Record<DashKind, string> = { admin: 'Owner / Principal', teacher: 'Teacher', student: 'Student', parent: 'Parent', driver: 'Bus driver', frontoffice: 'Front office', hr: 'HR', accounts: 'Accounts', staff: 'Non-teaching staff' };
  /** One example login for each kind of person in this demo centre. */
  async demoRoles(u: JwtUser) {
    const centreId = await this.demoCentre(u); if (!centreId) return { available: false, roles: [] };
    const rows = await this.dbs.db.select({ id: users.id, name: users.name, role: users.role, title: staffPermissions.title }).from(users).leftJoin(staffPermissions, eq(staffPermissions.userId, users.id)).where(eq(users.centreId, centreId)).orderBy(users.createdAt);
    const out: { kind: DashKind; label: string; userId: string; name: string; title: string; current: boolean }[] = [];
    for (const k of ['admin', 'teacher', 'student', 'parent', 'driver', 'frontoffice', 'hr', 'accounts', 'staff'] as DashKind[]) {
      const r = rows.find((x) => ['ADMIN', 'FACULTY', 'STAFF', 'STUDENT', 'PARENT'].includes(x.role) && !(x.role === 'STAFF' && String(x.title || '').toLowerCase() === 'sales demo') && dashKind(x.role, x.title) === k); if (r) out.push({ kind: k, label: AuthService.LABEL[k], userId: r.id, name: r.name, title: r.title || '', current: r.id === u.id });
    }
    return { available: true, roles: out, switched: !!u.demoFrom };
  }
  async demoSwitch(u: JwtUser, userId: string) {
    const centreId = await this.demoCentre(u); if (!centreId) throw new UnauthorizedException('Not available.');
    const [t] = await this.dbs.db.select().from(users).where(and(eq(users.id, userId), eq(users.centreId, centreId))); if (!t || !['ADMIN', 'FACULTY', 'STAFF', 'STUDENT', 'PARENT'].includes(t.role)) throw new UnauthorizedException('That login is not part of this demo.');
    return { ...(await this.issue(t, u.demoFrom || u.id)), demoCentreId: centreId };
  }
  /** Back to the person who started the demo view. */
  async demoBack(u: JwtUser) {
    if (!u.demoFrom) throw new UnauthorizedException('Not in a demo view.'); const [o] = await this.dbs.db.select().from(users).where(eq(users.id, u.demoFrom)); if (!o) throw new UnauthorizedException('Original login not found.');
    return { ...(await this.issue(o)), demoCentreId: u.centreId };
  }
}
