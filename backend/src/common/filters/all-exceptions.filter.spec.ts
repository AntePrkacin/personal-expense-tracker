import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ErrorResponseDto } from '../dto/error-response.dto';
import { AllExceptionsFilter } from './all-exceptions.filter';

/** `expect.any` is typed `any`; naming it keeps the typed literals below clean. */
const anyString = expect.any(String) as string;

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;

  const captured = (): ErrorResponseDto =>
    (json.mock.calls as ErrorResponseDto[][])[0][0];

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });

    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/users/1' }),
      }),
    } as unknown as ArgumentsHost;

    // The 500 path logs the real error by design; keep it out of the output.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('passes an HttpException through with its status and message', () => {
    filter.catch(new NotFoundException('User not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(captured()).toEqual({
      statusCode: 404,
      message: 'User not found',
      error: 'Not Found',
      timestamp: anyString,
      path: '/api/users/1',
    });
  });

  it("keeps ValidationPipe's message array intact", () => {
    filter.catch(new BadRequestException(['email must be an email']), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(captured().message).toEqual(['email must be an email']);
  });

  it('reduces an unknown error to a generic 500 that leaks nothing', () => {
    filter.catch(new Error('UNIQUE constraint failed: users.email'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(captured()).toEqual({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
      timestamp: anyString,
      path: '/api/users/1',
    });
  });

  it('handles a thrown non-Error without blowing up', () => {
    filter.catch('something odd', host);

    expect(status).toHaveBeenCalledWith(500);
    expect(captured().message).toBe('Internal server error');
  });
});
