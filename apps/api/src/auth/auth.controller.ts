import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';

class SendOtpDto { @IsOptional() @IsString() @Length(10, 10) mobile?: string; @IsOptional() @IsEmail() email?: string; @IsOptional() @IsString() centreId?: string; @IsOptional() @IsString() centreName?: string; @IsOptional() @IsIn(['sms', 'email']) channel?: 'sms' | 'email'; }
class VerifyOtpDto { @IsOptional() @IsString() @Length(10, 10) mobile?: string; @IsOptional() @IsEmail() email?: string; @IsString() @Length(6, 6) otp: string; @IsOptional() @IsString() centreId?: string; @IsOptional() @IsString() centreName?: string; }
class ChooseDto { @IsString() choiceToken: string; @IsString() userId: string; }

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  /** Login screen step 1: list of coachings (search by name). */
  /** Public: which OTP mode the server is running (none | dev | live). */
  @Public() @Get('mode') mode() { return { otpMode: (process.env.OTP_MODE || 'live').trim() }; }
  @Public() @Get('centres') centres(@Query('q') q?: string) { return this.auth.centres(q); }
  /** Login step 1: coaching name (typed) + email → OTP by email. (mobile + centreId still accepted for older app builds.) */
  @Public() @Post('send-otp') async sendOtp(@Body() dto: SendOtpDto) { const centreId = await this.auth.resolveCentre(dto.centreName, dto.centreId); return this.auth.sendOtp(dto.mobile, centreId, dto.channel || 'email', dto.email); }
  @Public() @Post('verify-otp') async verify(@Body() dto: VerifyOtpDto) { const centreId = await this.auth.resolveCentre(dto.centreName, dto.centreId); return this.auth.verifyOtp(dto.mobile, dto.otp, centreId, dto.email); }
  @Public() @Post('choose') choose(@Body() dto: ChooseDto) { return this.auth.choose(dto.choiceToken, dto.userId); }
  @Get('me') me(@CurrentUser() user: JwtUser) { return user; }
}
