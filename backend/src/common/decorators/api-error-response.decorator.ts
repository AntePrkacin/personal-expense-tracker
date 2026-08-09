import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

/**
 * Why these statuses read the way they do. `AllExceptionsFilter` gives every
 * failure the same body, so the only thing that differs per status is the
 * prose - which is exactly the part a handler-by-handler `@ApiResponse` would
 * get subtly wrong in one place and not another.
 */
const DESCRIPTIONS: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]:
    'Validation failed. `message` is the array of field errors produced by the global ValidationPipe.',
  [HttpStatus.UNAUTHORIZED]:
    'Not authenticated. The bearer credential is missing, invalid, expired or already spent.',
  [HttpStatus.NOT_FOUND]: 'No such resource.',
  [HttpStatus.CONFLICT]: 'The request conflicts with the current state.',
  [HttpStatus.TOO_MANY_REQUESTS]:
    'Rate limited. Refused by the throttler guard, which runs before the request body is ever validated.',
  [HttpStatus.PAYLOAD_TOO_LARGE]:
    'The upload exceeded its size cap. `message` names which cap was passed.',
  [HttpStatus.SERVICE_UNAVAILABLE]:
    'The feature is not configured on this deployment.',
  [HttpStatus.GATEWAY_TIMEOUT]:
    'A downstream call did not finish in time. Safe to retry.',
  [HttpStatus.INTERNAL_SERVER_ERROR]:
    'Unexpected failure. Logged in full server-side and reduced to this generic body outward.',
};

/**
 * Document one or more failure statuses with the shared error body.
 *
 * `@ApiErrorResponse(400, 429)` beats repeating `@ApiResponse({ status, type:
 * ErrorResponseDto })` per status per handler, and means the descriptions
 * above are written once. Add a status here when an endpoint that throws it
 * lands.
 */
export function ApiErrorResponse(
  ...statuses: HttpStatus[]
): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status],
        type: ErrorResponseDto,
      }),
    ),
  );
}
