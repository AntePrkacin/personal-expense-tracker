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
  let logError: jest.SpyInstance;
  let logDebug: jest.SpyInstance;

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

    // The 500 path logs the real error by design; keep it out of the output. Held in variables
    // rather than asserted as `Logger.prototype.error`, which reads an unbound method and is what
    // `@typescript-eslint/unbound-method` rejects.
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    logDebug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
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

  describe('a request the client abandoned', () => {
    // PET-73 made one route cancellable, so an `AbortError` reaching this filter is the feature
    // working rather than a fault - and a routine user action reading as an unhandled exception is
    // how a log full of them hides the real ones.
    const abort = () => {
      const error = new Error('This operation was aborted');
      error.name = 'AbortError';
      return error;
    };

    it('logs at debug rather than error', () => {
      filter.catch(abort(), host);

      expect(logDebug).toHaveBeenCalled();
      expect(logError).not.toHaveBeenCalled();
    });

    it('still answers the same generic body, because nobody is listening either way', () => {
      filter.catch(abort(), host);

      expect(status).toHaveBeenCalledWith(500);
      expect(captured().message).toBe('Internal server error');
    });

    it('does not mistake an ordinary error for one', () => {
      // The discriminating case: without it, "logs at debug" would pass for a filter that logged
      // everything at debug.
      filter.catch(new Error('the database went away'), host);

      expect(logError).toHaveBeenCalled();
      expect(logDebug).not.toHaveBeenCalled();
    });

    it('matches on the name rather than on instanceof, which crosses no realm', () => {
      // The driver, the SDK and `AbortSignal.any` each build their abort in their own module, so
      // under Jest's registry an identity check is false for an object that prints as one - the
      // same trap `common/unique-violation.ts` records.
      filter.catch({ name: 'AbortError', message: 'aborted' }, host);

      expect(logDebug).toHaveBeenCalled();
      expect(logError).not.toHaveBeenCalled();
    });
  });
});
