import { Global, Module } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { NotificationsService } from '../notifications/notifications.service';
@Global() @Module({ providers: [PlatformService, NotificationsService], exports: [PlatformService, NotificationsService] }) export class PlatformModule {}
