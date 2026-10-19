import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';

class SendOtpDto { @IsString() @Length(10, 10) mobile: string; @IsOptional() @IsString() centreId?: string; @IsOptional() @IsIn(['sms', 'email']) channel?: 'sms' | 'email'; }
class VerifyOtpDto { @IsString() @Length(10, 10) mobile: string; @IsString() @Length(6, 6) otp: string; @IsOptional() @IsString() centreId?: string; }
class ChooseDto { @IsString() choiceToken: string; @IsString() userId: string; }

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  /** Login screen step 1: list of coachings (search by name). */
  @Public() @Get('centres') centres(@Query('q') q?: string) { return this.auth.centres(q); }
  @Public() @Post('send-otp') sendOtp(@Body() dto: SendOtpDto) { return this.auth.sendOtp(dto.mobile, dto.centreId, dto.channel || 'sms'); }
  @Public() @Post('verify-otp') verify(@Body() dto: VerifyOtpDto) { return this.auth.verifyOtp(dto.mobile, dto.otp, dto.centreId); }
  @Public() @Post('choose') choose(@Body() dto: ChooseDto) { return this.auth.choose(dto.choiceToken, dto.userId); }
  @Get('me') me(@CurrentUser() user: JwtUser) { return user; }
}
