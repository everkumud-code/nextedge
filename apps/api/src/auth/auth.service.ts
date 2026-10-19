import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { users } from '../db/schema';
import { RedisService } from '../common/redis.service';
import { sendSms } from '../integrations/sms';

const OTP_TTL = 5 * 60;           // seconds an OTP stays valid
const SEND_LIMIT = 5;             // OTPs per number per hour
const VERIFY_LIMIT = 5;           // wrong attempts per OTP before it is burned

// OTP_MODE=dev -> OTP is always 123456 (no SMS cost while building). OTP_MODE=msg91 -> real SMS via MSG91.
@Injectable()
export class AuthService {
  constructor(private dbs: DbService, private jwt: JwtService, private redis: RedisService) {}

  async sendOtp(mobile: string) {
    const sends = await this.redis.hit(`otp:sends:${mobile}`, 3600);
    if (sends > SEND_LIMIT) throw new HttpException('Too many OTP requests. Try again after an hour.', 429);
    const code = process.env.OTP_MODE === 'dev' ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
    await this.redis.set(`otp:code:${mobile}`, code, OTP_TTL);
    await this.redis.del(`otp:fails:${mobile}`);
    if (process.env.OTP_MODE !== 'dev') await sendSms(mobile, `${code} is your login OTP for Coaching Connect. Valid for 5 minutes.`, code);
    return { sent: true, expiresIn: OTP_TTL, devHint: process.env.OTP_MODE === 'dev' ? '123456' : undefined };
  }

  async verifyOtp(mobile: string, code: string) {
    const stored = await this.redis.get(`otp:code:${mobile}`);
    if (!stored) throw new UnauthorizedException('OTP expired. Request a new one.');
    if (stored !== code) {
      const fails = await this.redis.hit(`otp:fails:${mobile}`, OTP_TTL);
      if (fails >= VERIFY_LIMIT) { await this.redis.del(`otp:code:${mobile}`); throw new UnauthorizedException('Too many wrong attempts. Request a new OTP.'); }
      throw new UnauthorizedException(`Wrong OTP. ${VERIFY_LIMIT - fails} attempts left.`);
    }
    await this.redis.del(`otp:code:${mobile}`);
    const user = await this.dbs.db.query.users.findFirst({ where: eq(users.mobile, mobile) });
    if (!user) throw new UnauthorizedException('This mobile number is not registered with any centre');
    const token = await this.jwt.signAsync({ id: user.id, role: user.role, centreId: user.centreId, name: user.name });
    return { token, user: { id: user.id, name: user.name, role: user.role, centreId: user.centreId } };
  }
}
