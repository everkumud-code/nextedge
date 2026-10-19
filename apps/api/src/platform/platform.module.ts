import { Global, Module } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../notifications/mail.service';
@Global() @Module({ providers: [PlatformService, NotificationsService, MailService], exports: [PlatformService, NotificationsService, MailService] }) export class PlatformModule {}
