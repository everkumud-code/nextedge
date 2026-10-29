import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/** A request that leaves out a required value (for example /attendance without batchId) used to end in a 500 from the database or S3 library. It is the caller's mistake, so answer 400 with a plain message; everything else behaves as before. */
@Catch()
export class SafeInputFilter extends BaseExceptionFilter {
  catch(e: any, host: ArgumentsHost) {
    const msg = String(e?.message || ''); const code = e?.code || e?.cause?.code;
    if (!(e instanceof HttpException) && (code === 'UNDEFINED_VALUE' || /Undefined values are not allowed|No value provided for input/.test(msg))) {
      return super.catch(new HttpException('A required value is missing. Please check what you sent.', HttpStatus.BAD_REQUEST), host);
    }
    return super.catch(e, host);
  }
}
