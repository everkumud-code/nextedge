import { All, Controller, Query, Req, Res } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { biometricDevices } from '../db/schema';
import { Public } from '../common/auth.guard';
import { BiometricController } from './biometric.controller';

/** ZKTeco "ADMS" push protocol. The machine is pointed at this server and sends attendance lines by itself; only machines registered by the school (serial number) are accepted. Lives at /iclock/* (no /api prefix) because machines use fixed paths. */
@Controller('iclock')
export class IclockController {
  constructor(private dbs: DbService, private bio: BiometricController) {}
  private text(res: any, body: string) { res.status(200).type('text/plain').send(body); }
  private async device(sn?: string) { const serial = String(sn || '').trim().toUpperCase(); if (!serial) return null; const [d] = await this.dbs.db.select().from(biometricDevices).where(eq(biometricDevices.serial, serial)); return d || null; }

  /** Handshake (GET) and attendance upload (POST ?table=ATTLOG). */
  @Public() @All('cdata') async cdata(@Query() q: any, @Req() req: any, @Res() res: any) {
    const dev = await this.device(q.SN); if (!dev) return this.text(res, 'OK'); // unknown machine: stay polite, record nothing
    if (req.method === 'GET') { await this.dbs.db.update(biometricDevices).set({ lastSeen: new Date() }).where(eq(biometricDevices.serial, dev.serial)); return this.text(res, `GET OPTION FROM: ${dev.serial}\nATTLOGStamp=None\nOPERLOGStamp=9999\nATTPHOTOStamp=None\nErrorDelay=30\nDelay=10\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=TransData AttLog\nRealtime=1\nEncrypt=0\n`); }
    const table = String(q.table || '').toUpperCase(); const raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (table !== 'ATTLOG') return this.text(res, 'OK'); // operation logs, photos etc. are acknowledged and ignored
    const punches: { id: string; time: string }[] = []; for (const line of raw.split(/\r?\n/)) { const f = line.trim().split(/\t| {2,}/); if (f.length < 2 || !/^\d+$/.test(f[0])) continue; const m = f[1].match(/^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)/); if (!m) continue; punches.push({ id: f[0], time: new Date(`${m[1]}T${m[2]}+05:30`).toISOString() }); } // machine clocks show Indian time
    const r = punches.length ? await this.bio.process(dev.centreId, punches.slice(0, 2000)) : null;
    await this.dbs.db.update(biometricDevices).set({ lastSeen: new Date(), lastPunches: punches.length }).where(eq(biometricDevices.serial, dev.serial)); return this.text(res, `OK: ${punches.length}`);
  }
  @Public() @All('getrequest') async getrequest(@Query() q: any, @Res() res: any) { const d = await this.device(q.SN); if (d) await this.dbs.db.update(biometricDevices).set({ lastSeen: new Date() }).where(eq(biometricDevices.serial, d.serial)); return this.text(res, 'OK'); }
  @Public() @All('devicecmd') devicecmd(@Res() res: any) { return this.text(res, 'OK'); }
}
