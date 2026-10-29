import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Put, Query } from '@nestjs/common';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { MessagingService } from './messaging.service';

/** SMS, WhatsApp and email settings (platform default for the super admin, own account per centre), connection status, test sends and the delivery log. */
@Controller('messaging')
@Roles('SUPER_ADMIN', 'ADMIN')
export class MessagingController {
  constructor(private m: MessagingService) {}
  /** platform = a super admin outside any centre; otherwise the centre in context (owner's own, or the one the super admin opened). */
  private scope(u: JwtUser, c?: string, requested?: string): string | null {
    if (requested === 'platform') { if (u.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only the platform team can change platform settings'); return null; }
    if (u.role === 'SUPER_ADMIN' && !u.centreId && !c) return null; const id = u.role === 'SUPER_ADMIN' ? (c || u.centreId) : u.centreId; if (!id) throw new BadRequestException('Choose a centre'); return id;
  }
  @Get('status') status(@CurrentUser() u: JwtUser, @Query('centreId') c?: string, @Query('scope') scope?: string) { return this.m.status(this.scope(u, c, scope)); }
  @Get('config') config(@CurrentUser() u: JwtUser, @Query('centreId') c?: string, @Query('scope') scope?: string) { return this.m.getConfig(this.scope(u, c, scope)); }
  @Put('config') async setConfig(@CurrentUser() u: JwtUser, @Body() b: { scope?: string; sms?: any; whatsapp?: any }, @Query('centreId') c?: string) { const scope = this.scope(u, c, b.scope); try { return await this.m.setConfig(scope, b); } catch (e: any) { throw new BadRequestException(e.message); } }
  @Post('test') async test(@CurrentUser() u: JwtUser, @Body() b: { scope?: string; channel: 'sms' | 'whatsapp' | 'email'; to: string }, @Query('centreId') c?: string) {
    if (!['sms', 'whatsapp', 'email'].includes(b.channel)) throw new BadRequestException('Choose sms, whatsapp or email'); const to = String(b.to || '').trim(); if (b.channel === 'email' ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) : to.replace(/\D/g, '').length < 10) throw new BadRequestException(b.channel === 'email' ? 'Enter a valid email address' : 'Enter a 10-digit mobile number');
    return this.m.test(this.scope(u, c, b.scope), b.channel, to);
  }
  @Get('log') log(@CurrentUser() u: JwtUser, @Query('centreId') c?: string, @Query('scope') scope?: string, @Query('channel') ch?: string, @Query('status') st?: string) { return this.m.logs(this.scope(u, c, scope), ch, st); }
}
