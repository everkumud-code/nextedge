import { Global, Module } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../notifications/mail.service';
import { MessagingService } from '../messaging/messaging.service';
@Global() @Module({ providers: [PlatformService, NotificationsService, MailService, MessagingService], exports: [PlatformService, NotificationsService, MailService, MessagingService] }) export class PlatformModule {}
