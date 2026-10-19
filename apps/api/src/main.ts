import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  if (process.env.SEED_ON_BOOT === 'true') { try { await (await import('./db/seed')).seed(); } catch (e) { console.error('Seed failed', e); } }
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const co = process.env.CORS_ORIGIN; app.enableCors({ origin: !co || co === '*' ? true : co.split(','), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`API listening on :${port}`);
}
bootstrap();
