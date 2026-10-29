import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { AuthService } from './auth.service';
import { MailService } from '../notifications/mail.service';
import { JwtService } from '@nestjs/jwt';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { Public } from '../common/auth.guard';

class SendOtpDto { @IsOptional() @IsString() @Length(10, 10) mobile?: string; @IsOptional() @IsEmail() email?: string; @IsOptional() @IsString() centreId?: string; @IsOptional() @IsString() centreName?: string; @IsOptional() @IsIn(['sms', 'email']) channel?: 'sms' | 'email'; }
class VerifyOtpDto { @IsOptional() @IsString() @Length(10, 10) mobile?: string; @IsOptional() @IsEmail() email?: string; @IsString() @Length(6, 6) otp: string; @IsOptional() @IsString() centreId?: string; @IsOptional() @IsString() centreName?: string; }
class ChooseDto { @IsString() choiceToken: string; @IsString() userId: string; }

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private mail: MailService, private jwt: JwtService) {}
  /** Login screen step 1: list of coachings (search by name). */
  /** Public: which OTP mode the server is running (none | dev | live). */
  /** 10-minute token for opening a PDF (report card, receipt, certificate, payslip) in the phone's browser. */
  @Post('link-token') async linkToken(@CurrentUser() u: JwtUser) { return { token: await this.jwt.signAsync({ id: u.id, role: u.role, centreId: u.centreId, name: u.name, modules: u.modules || [] }, { expiresIn: '10m' }) }; }
  @Public() @Get('mode') async mode() { return { otpMode: (process.env.OTP_MODE || 'db').trim(), otpEnabled: await this.mail.otpEnabled() }; }
  @Public() @Get('centres') centres(@Query('q') q?: string) { return this.auth.centres(q); }
  /** Login step 1: coaching name (typed) + email → OTP by email. (mobile + centreId still accepted for older app builds.) */
  @Public() @Post('send-otp') async sendOtp(@Body() dto: SendOtpDto) { const centreId = await this.auth.resolveCentre(dto.centreName, dto.centreId); return this.auth.sendOtp(dto.mobile, centreId, dto.channel || 'email', dto.email); }
  @Public() @Post('verify-otp') async verify(@Body() dto: VerifyOtpDto) { const centreId = await this.auth.resolveCentre(dto.centreName, dto.centreId); return this.auth.verifyOtp(dto.mobile, dto.otp, centreId, dto.email); }
  @Public() @Post('choose') choose(@Body() dto: ChooseDto) { return this.auth.choose(dto.choiceToken, dto.userId); }
  @Get('me') me(@CurrentUser() user: JwtUser) { return user; }
}
