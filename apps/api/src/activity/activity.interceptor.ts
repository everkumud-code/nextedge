import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ActivityService } from './activity.service';

/** Writes one line to the activity log after every add / edit / delete that went through (the guard has already put the person on the request). */
@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private act: ActivityService) {}
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(tap((res) => this.act.record(req, res)));
  }
}
