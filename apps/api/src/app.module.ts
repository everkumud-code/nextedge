import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, Public } from './common/auth.guard';
import { StudentsController } from './students/students.controller';
import { StudentsService } from './students/students.service';
import { BatchesController } from './batches/batches.controller';
import { AttendanceController } from './attendance/attendance.controller';
import { FeesController } from './fees/fees.controller';
import { NoticesController } from './notices/notices.controller';
import { NotificationsService } from './notifications/notifications.service';
import { NotificationsController } from './notifications/notifications.controller';
import { ChatGateway } from './chat/chat.gateway';
import { ChatController } from './chat/chat.controller';
import { ContentController } from './content/content.controller';
import { TimetableController } from './timetable/timetable.controller';
import { CentresController } from './centres/centres.controller';
import { TestsController } from './tests/tests.controller';
import { HomeworkController } from './homework/homework.controller';
import { LiveController } from './live/live.controller';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { SchedulerService } from './common/scheduler.service';
import { StaffController } from './staff/staff.controller';
import { DoubtsController } from './doubts/doubts.controller';
import { LeavesController } from './leaves/leaves.controller';
import { FeedbackController } from './feedback/feedback.controller';
import { EnquiriesController } from './enquiries/enquiries.controller';
import { WishesController } from './wishes/wishes.controller';
import { PlatformController, SubscriptionController } from './platform/platform.controller';
import { PlatformModule } from './platform/platform.module';
import { StaffAttendanceController } from './staff-attendance/staff-attendance.controller';
import { WellbeingController } from './wellbeing/wellbeing.controller';
import { NewsController } from './news/news.controller';

@Controller()
class HealthController { @Public() @Get('health') health() { return { ok: true, service: 'nextedge-api', time: new Date().toISOString() }; } }

@Module({
  imports: [DbModule, PlatformModule, AuthModule],
  controllers: [HealthController, StudentsController, BatchesController, AttendanceController, FeesController, NoticesController, NotificationsController, ChatController, ContentController, TimetableController, CentresController, TestsController, HomeworkController, LiveController, ReportsController, StaffController, DoubtsController, LeavesController, FeedbackController, EnquiriesController, WishesController, PlatformController, SubscriptionController, StaffAttendanceController, WellbeingController, NewsController],
  providers: [StudentsService, ChatGateway, ReportsService, SchedulerService, FeesController, WishesController, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
