import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** The single error shape every failed request returns. */
export interface ErrorResponseBody {
  statusCode: number;
  /** String for most errors; an array for class-validator's field messages. */
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}

/**
 * Catches everything so clients get one predictable error shape.
 *
 * HttpExceptions are trusted and passed through (including the message arrays
 * ValidationPipe produces, which the frontend needs for field-level errors).
 * Anything else is a bug or an infrastructure failure: it is logged in full
 * server-side and reduced to a generic 500 outward, so stack traces, SQL and
 * credentials never reach a client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body: ErrorResponseBody =
      exception instanceof HttpException
        ? this.fromHttpException(exception, request.url)
        : this.fromUnknown(exception, request.url);

    response.status(body.statusCode).json(body);
  }

  private fromHttpException(
    exception: HttpException,
    path: string,
  ): ErrorResponseBody {
    const statusCode = exception.getStatus();
    const payload = exception.getResponse();

    // getResponse() is a string for `new NotFoundException('msg')` and an
    // object for the built-in shape and for ValidationPipe's output.
    const { message, error } =
      typeof payload === 'string'
        ? { message: payload, error: exception.name }
        : {
            message:
              (payload as { message?: string | string[] }).message ??
              exception.message,
            error: (payload as { error?: string }).error ?? exception.name,
          };

    return {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path,
    };
  }

  private fromUnknown(exception: unknown, path: string): ErrorResponseBody {
    this.logger.error(
      `Unhandled exception on ${path}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
      timestamp: new Date().toISOString(),
      path,
    };
  }
}
