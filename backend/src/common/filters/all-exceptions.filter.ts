import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorResponseDto } from '../dto/error-response.dto';

/**
 * Catches everything so clients get one predictable error shape.
 *
 * HttpExceptions are trusted and passed through (including the message arrays
 * ValidationPipe produces, which the frontend needs for field-level errors).
 * Anything else is a bug or an infrastructure failure: it is logged in full
 * server-side and reduced to a generic 500 outward, so stack traces, SQL and
 * credentials never reach a client.
 *
 * **One exception to "anything else is a bug": a request the client abandoned.**
 * PET-73 made a route cancellable - `abortOnClientDisconnect` aborts the Gemini
 * call when the browser goes away - so an `AbortError` reaching here is the
 * feature working, not a fault. Logged at `debug` rather than `error`, because a
 * routine user action reading as an unhandled exception is how a log full of them
 * hides the real ones. The response is still written on the same path: nobody is
 * listening, so its status is immaterial, and branching on that would be a second
 * thing to get wrong.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body: ErrorResponseDto =
      exception instanceof HttpException
        ? this.fromHttpException(exception, request.url)
        : this.fromUnknown(exception, request.url);

    response.status(body.statusCode).json(body);
  }

  private fromHttpException(
    exception: HttpException,
    path: string,
  ): ErrorResponseDto {
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

  private fromUnknown(exception: unknown, path: string): ErrorResponseDto {
    if (isClientAbort(exception)) {
      this.logger.debug(
        `Request on ${path} was abandoned by the client; the work behind it was cancelled.`,
      );
    } else {
      this.logger.error(
        `Unhandled exception on ${path}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
      timestamp: new Date().toISOString(),
      path,
    };
  }
}

/**
 * Whether this is a caller who went away rather than something that went wrong.
 *
 * **Duck-typed on `name`, never `instanceof DOMException`**, for the reason
 * `src/common/unique-violation.ts` records about `instanceof Error`: the abort is
 * constructed inside whichever module owns the signal - the platform's `fetch`,
 * the `@google/genai` SDK, or `AbortSignal.any` - and under Jest's module registry
 * those are different realms with different globals, so an identity check is
 * `false` for an object that prints as one.
 *
 * Deliberately narrow. A **timeout** is not this: `AssistantCompletionService`
 * converts its own timeout into a `GatewayTimeoutException` before it ever
 * reaches here, so a 504 stays a documented answer with a real caller waiting for
 * it, and only a genuinely abandoned request lands in this branch.
 */
function isClientAbort(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    (exception as { name?: unknown }).name === 'AbortError'
  );
}
