import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { users } from '../db/schema';

// OTP_MODE=dev -> OTP is always 123456 (no SMS cost while building). OTP_MODE=msg91 -> real SMS via MSG91.
@Injectable()
export class AuthService {
  private otps = new Map<string, { code: string; exp: number }>(); // move to Redis in Phase 1
  constructor(private dbs: DbService, private jwt: JwtService) {}

  async sendOtp(mobile: string) {
    const code = process.env.OTP_MODE === 'dev' ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
    this.otps.set(mobile, { code, exp: Date.now() + 5 * 60_000 });
    if (process.env.OTP_MODE === 'msg91') {
      await fetch('https://control.msg91.com/api/v5/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authkey: process.env.MSG91_AUTH_KEY! },
        body: JSON.stringify({ mobile: `91${mobile}`, otp: code, template_id: process.env.MSG91_TEMPLATE_ID }),
      });
    }
    return { sent: true, devHint: process.env.OTP_MODE === 'dev' ? '123456' : undefined };
  }

  async verifyOtp(mobile: string, code: string) {
    const rec = this.otps.get(mobile);
    if (!rec || rec.code !== code || rec.exp < Date.now()) throw new UnauthorizedException('Wrong or expired OTP');
    this.otps.delete(mobile);
    const user = await this.dbs.db.query.users.findFirst({ where: eq(users.mobile, mobile) });
    if (!user) throw new UnauthorizedException('This mobile number is not registered with any centre');
    const token = await this.jwt.signAsync({ id: user.id, role: user.role, centreId: user.centreId, name: user.name });
    return { token, user: { id: user.id, name: user.name, role: user.role, centreId: user.centreId } };
  }
}
