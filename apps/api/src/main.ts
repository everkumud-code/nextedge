import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { SafeInputFilter } from './common/safe-input.filter';
import { AppModule } from './app.module';
import { PlatformService } from './platform/platform.service';

// One bad request must never take the whole API down (a free-tier server has a single process).
process.on('uncaughtException', (e) => console.error('uncaughtException', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));

async function bootstrap() {
  if (process.env.SEED_ON_BOOT === 'true') { try { await (await import('./db/seed')).seed(); } catch (e) { console.error('Seed failed', e); } }
  const app = await NestFactory.create<any>(AppModule, { rawBody: true });
  app.useBodyParser('json', { limit: '12mb' });
  const co = process.env.CORS_ORIGIN; const listed = co && co !== '*' ? co.split(',').map((x) => x.trim()) : null; const own = /^https:\/\/coaching-connect-[a-z0-9-]+\.onrender\.com$/; /* our own admin panel and web app on Render are always allowed */ app.enableCors({ origin: listed ? (o: string | undefined, cb: (e: Error | null, ok?: boolean) => void) => cb(null, !o || listed.includes(o) || own.test(o)) : true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new SafeInputFilter(app.get(HttpAdapterHost).httpAdapter));
  app.use('/iclock', require('express').text({ type: () => true, limit: '2mb' })); // biometric machines send plain text
  app.setGlobalPrefix('api', { exclude: [{ path: 'iclock/cdata', method: RequestMethod.ALL }, { path: 'iclock/getrequest', method: RequestMethod.ALL }, { path: 'iclock/devicecmd', method: RequestMethod.ALL }] });
  try { await app.get(PlatformService).migrateFeatures(); } catch (e) { console.error('Feature migration failed', e); }
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`API listening on :${port} · OTP_MODE=${(process.env.OTP_MODE || 'live').trim()}`);
  // Demo clients get realistic data in every module — in the background, so the API is available immediately.
  if (process.env.SEED_ON_BOOT === 'true' && process.env.DEMO_FILL !== 'off') setImmediate(() => import('./db/demo-fill').then((m) => m.fillDemoData()).catch((e) => console.error('[demo-fill] failed', e)));
}
bootstrap();
