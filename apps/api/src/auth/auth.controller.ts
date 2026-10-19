import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';

class SendOtpDto { @IsString() @Length(10, 10) mobile: string; }
class VerifyOtpDto { @IsString() @Length(10, 10) mobile: string; @IsString() @Length(6, 6) otp: string; }

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Public() @Post('send-otp') sendOtp(@Body() dto: SendOtpDto) { return this.auth.sendOtp(dto.mobile); }
  @Public() @Post('verify-otp') verify(@Body() dto: VerifyOtpDto) { return this.auth.verifyOtp(dto.mobile, dto.otp); }
  @Get('me') me(@CurrentUser() user: JwtUser) { return user; }
}
