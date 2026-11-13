import { DbService } from '../db/db.service';
import { MessagingService } from '../messaging/messaging.service';
import { loginLog } from '../db/schema';
import { Req, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { AuthService } from './auth.service';
import { MailService } from '../notifications/mail.service';
import { JwtService } from '@nestjs/jwt';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { Public } from '../common/auth.guard';

class SendOtpDto { @IsOptional() @IsString() @Length(10, 10) mobile?: string; @IsOptional() @IsEmail() email?: string; @IsOptional() @IsString() centreId?: string; @IsOptional() @IsString() centreName?: string; @IsOptional() @IsIn(['sms', 'email', 'whatsapp']) channel?: 'sms' | 'email' | 'whatsapp'; }
class VerifyOtpDto { @IsOptional() @IsString() @Length(10, 10) mobile?: string; @IsOptional() @IsEmail() email?: string; @IsString() @Length(6, 6) otp: string; @IsOptional() @IsString() centreId?: string; @IsOptional() @IsString() centreName?: string; }
class ChooseDto { @IsString() choiceToken: string; @IsString() userId: string; }

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private mail: MailService, private jwt: JwtService, private dbs: DbService, private msg: MessagingService) {}
  /** Login screen step 1: list of coachings (search by name). */
  /** Public: which OTP mode the server is running (none | dev | live). */
  /** 10-minute token for opening a PDF (report card, receipt, certificate, payslip) in the phone's browser. */
  @Post('link-token') async linkToken(@CurrentUser() u: JwtUser) { return { token: await this.jwt.signAsync({ id: u.id, role: u.role, centreId: u.centreId, name: u.name, modules: u.modules || [] }, { expiresIn: '10m' }) }; }
  @Public() @Get('mode') async mode() { const st = await this.msg.status(null); return { otpMode: (process.env.OTP_MODE || 'db').trim(), otpEnabled: await this.mail.otpEnabled(), channels: { email: true, sms: st.sms.ready, whatsapp: st.whatsapp.ready } }; }
  @Public() @Get('centres') centres(@Query('q') q?: string) { return this.auth.centres(q); }
  /** Login step 1: coaching name (typed) + email → OTP by email. (mobile + centreId still accepted for older app builds.) */
  @Public() @Post('send-otp') async sendOtp(@Body() dto: SendOtpDto, @Req() req: any) {
    const centreId = await this.auth.resolveCentre(dto.centreName, dto.centreId); const r: any = await this.auth.sendOtp(dto.mobile, centreId, dto.channel, dto.email);
    // OTP switched off: this call logs the person in directly, so record it here.
    if (r?.user) this.dbs.db.insert(loginLog).values({ centreId: r.user.centreId, userId: r.user.id, name: r.user.name, role: r.user.role, channel: 'direct', ok: true, ip: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(), device: String(req.headers['user-agent'] || '').slice(0, 160) }).catch(() => {}); return r;
  }
  @Public() @Post('verify-otp') async verify(@Body() dto: VerifyOtpDto, @Req() req: any) {
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(); const device = String(req.headers['user-agent'] || '').slice(0, 160); const centreId = await this.auth.resolveCentre(dto.centreName, dto.centreId);
    try { const r: any = await this.auth.verifyOtp(dto.mobile, dto.otp, centreId, dto.email); ;
      if (r?.user) this.dbs.db.insert(loginLog).values({ centreId: r.user.centreId, userId: r.user.id, name: r.user.name, role: r.user.role, channel: 'otp', ok: true, ip, device }).catch(() => {}); return r;
    } catch (e: any) { this.dbs.db.insert(loginLog).values({ centreId, name: String(dto.mobile || '').slice(0, 40), ok: false, note: String(e?.message || 'failed').slice(0, 120), ip, device }).catch(() => {}); throw e; }
  }
  @Public() @Post('choose') choose(@Body() dto: ChooseDto) { return this.auth.choose(dto.choiceToken, dto.userId); }
  @Get('me') me(@CurrentUser() user: JwtUser) { return user; }
  /** Demo only: which example logins can this person step into? */
  @Get('demo-roles') demoRoles(@CurrentUser() user: JwtUser) { return this.auth.demoRoles(user); }
  @Post('demo-switch') demoSwitch(@CurrentUser() user: JwtUser, @Body() b: { userId: string }) { return this.auth.demoSwitch(user, b?.userId); }
  @Post('demo-back') demoBack(@CurrentUser() user: JwtUser) { return this.auth.demoBack(user); }
}
