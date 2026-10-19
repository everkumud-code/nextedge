import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull, or, ilike } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centres, staffPermissions, users } from '../db/schema';
import { FACULTY_DEFAULT, MODULES } from '../common/permissions';
import { PlatformService } from '../platform/platform.service';
import { RedisService } from '../common/redis.service';
import { sendSms } from '../integrations/sms';
import { sendEmail } from '../integrations/email';

const OTP_TTL = 5 * 60, SEND_LIMIT = 5, VERIFY_LIMIT = 5;
type Account = { id: string; name: string; role: any; centreId: string | null; email: string | null; mobile: string };

/** Login = choose coaching → mobile → OTP by SMS or email. OTP_MODE=dev → OTP is always 123456. */
@Injectable()
export class AuthService {
  constructor(private dbs: DbService, private jwt: JwtService, private redis: RedisService, private platform: PlatformService) {}

  /** Public list for the login screen. */
  async centres(q?: string) {
    const rows = await this.dbs.db.select({ id: centres.id, name: centres.name, city: centres.city }).from(centres).where(q ? ilike(centres.name, `%${q}%`) : undefined).orderBy(centres.name).limit(50);
    return rows;
  }

  /** Finds the account for this mobile in this centre (centreId 'platform' = super admin). */
  private async account(centreId: string | undefined, mobile: string): Promise<Account | null> {
    const where = centreId === 'platform' ? and(eq(users.mobile, mobile), isNull(users.centreId)) : centreId ? and(eq(users.mobile, mobile), eq(users.centreId, centreId)) : eq(users.mobile, mobile);
    const [u] = await this.dbs.db.select({ id: users.id, name: users.name, role: users.role, centreId: users.centreId, email: users.email, mobile: users.mobile }).from(users).where(where).limit(1);
    return u || null;
  }

  async sendOtp(mobile: string, centreId?: string, channel: 'sms' | 'email' = 'sms') {
    const acct = await this.account(centreId, mobile);
    if (!acct) throw new UnauthorizedException(centreId ? 'This mobile number is not registered at this coaching. Ask the centre to check.' : 'This mobile number is not registered.');
    if (channel === 'email' && !acct.email) throw new HttpException('No email on record for this number. Use SMS, or ask the centre to add your email.', 400);
    const key = `${centreId || 'any'}:${mobile}`;
    const sends = await this.redis.hit(`otp:sends:${key}`, 3600);
    if (sends > SEND_LIMIT) throw new HttpException('Too many OTP requests. Try again after an hour.', 429);
    const code = process.env.OTP_MODE === 'dev' ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
    await this.redis.set(`otp:code:${key}`, code, OTP_TTL); await this.redis.del(`otp:fails:${key}`);
    let delivered = 'dev';
    if (process.env.OTP_MODE !== 'dev') {
      if (channel === 'email') { const ok = await sendEmail(acct.email!, `${code} is your Coaching Connect OTP`, `Your login OTP is ${code}. It is valid for 5 minutes.`); delivered = ok ? 'email' : 'none'; if (!ok) throw new HttpException('Email is not configured on the server yet.', 503); }
      else { try { await sendSms(mobile, `${code} is your login OTP for Coaching Connect. Valid for 5 minutes.`, code); delivered = 'sms'; } catch (e: any) { if (acct.email) { const ok = await sendEmail(acct.email, `${code} is your Coaching Connect OTP`, `Your login OTP is ${code}. It is valid for 5 minutes.`); delivered = ok ? 'email' : 'none'; } if (delivered === 'none') throw new HttpException('SMS is not set up yet. Choose "Email" to receive the OTP by email.', 503); } }
    }
    const mask = (e?: string | null) => e ? e.replace(/^(.{2}).*(@.*)$/, '$1***$2') : undefined;
    return { sent: true, via: delivered, to: delivered === 'email' ? mask(acct.email) : delivered === 'sms' ? `***${mobile.slice(-4)}` : undefined, expiresIn: OTP_TTL, devHint: process.env.OTP_MODE === 'dev' ? '123456' : undefined };
  }

  async verifyOtp(mobile: string, code: string, centreId?: string) {
    const key = `${centreId || 'any'}:${mobile}`;
    const stored = await this.redis.get(`otp:code:${key}`);
    if (!stored) throw new UnauthorizedException('OTP expired. Request a new one.');
    if (stored !== code) { const fails = await this.redis.hit(`otp:fails:${key}`, OTP_TTL); if (fails >= VERIFY_LIMIT) { await this.redis.del(`otp:code:${key}`); throw new UnauthorizedException('Too many wrong attempts. Request a new OTP.'); } throw new UnauthorizedException(`Wrong OTP. ${VERIFY_LIMIT - fails} attempts left.`); }
    await this.redis.del(`otp:code:${key}`);
    if (centreId) { const acct = await this.account(centreId, mobile); if (!acct) throw new UnauthorizedException('Account not found'); return this.issue(acct); }
    // No centre given (older app): fall back to the chooser when the number exists in several places.
    const accounts = await this.dbs.db.select({ id: users.id, name: users.name, role: users.role, centreId: users.centreId, centreName: centres.name }).from(users).leftJoin(centres, eq(centres.id, users.centreId)).where(eq(users.mobile, mobile));
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

  private async issue(user: { id: string; name: string; role: any; centreId: string | null }) {
    let modules: string[] = [];
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') modules = [...MODULES];
    else if (user.role === 'FACULTY' || user.role === 'STAFF') {
      const [p] = await this.dbs.db.select().from(staffPermissions).where(eq(staffPermissions.userId, user.id));
      if (p && !p.active) throw new UnauthorizedException('Your staff account is deactivated. Contact the owner.');
      modules = p ? JSON.parse(p.modules) : user.role === 'FACULTY' ? FACULTY_DEFAULT : [];
    }
    let features: string[] = [...MODULES], status = 'active';
    if (user.centreId) { const s = await this.platform.settings(user.centreId); features = s.features.length ? s.features : [...MODULES]; status = s.status; modules = modules.filter((m) => features.includes(m)); }
    const token = await this.jwt.signAsync({ id: user.id, role: user.role, centreId: user.centreId, name: user.name, modules });
    return { token, user: { id: user.id, name: user.name, role: user.role, centreId: user.centreId, modules, features, subscriptionStatus: status } };
  }
}
