import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, Public } from './common/auth.guard';
import { StudentsController } from './students/students.controller';
import { BatchesController } from './batches/batches.controller';
import { AttendanceController } from './attendance/attendance.controller';
import { FeesController } from './fees/fees.controller';
import { NoticesController } from './notices/notices.controller';

@Controller()
class HealthController { @Public() @Get('health') health() { return { ok: true, service: 'coaching-connect-api', time: new Date().toISOString() }; } }

@Module({
  imports: [DbModule, AuthModule],
  controllers: [HealthController, StudentsController, BatchesController, AttendanceController, FeesController, NoticesController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
