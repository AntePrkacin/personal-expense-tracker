import { BadRequestException, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { TemplatesService } from '../templates/templates.service';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { LoginTokenService } from './login-token.service';
import type { RegisterDto } from './dto/register.dto';

/** Lets the floated issue-and-send run to completion before asserting. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

// Template ids rather than names since PET-64. Real-looking UUIDs because
// RegisterDto validates the shape, though nothing in this suite runs the pipe.
const GROCERIES_ID = '0198f2b0-0000-7000-8000-000000000001';
const TRANSPORT_ID = '0198f2b0-0000-7000-8000-000000000002';

const dto: RegisterDto = {
  firstName: 'Marko',
  lastName: 'Kovac',
  email: 'marko@email.com',
  monthlyBudget: 2000.5,
  categories: [GROCERIES_ID, TRANSPORT_ID],
};

const payload = {
  firstName: 'Marko',
  lastName: 'Kovac',
  currency: 'USD',
  monthlyBudget: 2000.5,
  monthStartDay: 1,
  categories: [GROCERIES_ID, TRANSPORT_ID],
};

describe('AuthService', () => {
  let service: AuthService;
  let findByEmail: jest.Mock;
  let createPending: jest.Mock;
  let stashOnboardingPayload: jest.Mock;
  let issue: jest.Mock;
  let send: jest.Mock;
  let templatesExist: jest.Mock;
  let logError: jest.SpyInstance;

  beforeEach(() => {
    findByEmail = jest.fn().mockResolvedValue(null);
    createPending = jest.fn().mockResolvedValue('new-user-id');
    stashOnboardingPayload = jest.fn().mockResolvedValue(undefined);
    issue = jest.fn().mockResolvedValue('raw-token');
    send = jest.fn().mockResolvedValue(undefined);
    templatesExist = jest.fn().mockResolvedValue([GROCERIES_ID, TRANSPORT_ID]);

    service = new AuthService(
      {
        findByEmail,
        createPending,
        stashOnboardingPayload,
      } as unknown as UsersService,
      { issue, ttlMinutes: 15 } as unknown as LoginTokenService,
      { send },
      {
        get: (_key: string, fallback: unknown) => fallback,
      } as unknown as ConfigService,
      { exists: templatesExist } as unknown as TemplatesService,
    );

    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('register', () => {
    it('creates the account and sends exactly one link', async () => {
      await service.register({ ...dto });
      await flush();

      expect(createPending).toHaveBeenCalledWith('marko@email.com', payload);
      expect(issue).toHaveBeenCalledWith('new-user-id');
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'marko@email.com',
          tags: ['login-link'],
        }),
      );
    });

    it('applies the DTO defaults into the stashed payload', async () => {
      await service.register({ ...dto, currency: undefined });
      await flush();

      expect(createPending).toHaveBeenCalledWith(
        'marko@email.com',
        expect.objectContaining({ currency: 'USD', monthStartDay: 1 }),
      );
    });

    it('emails a link carrying the raw token, and never persists it elsewhere', async () => {
      await service.register({ ...dto });
      await flush();

      const [message] = send.mock.calls[0] as [
        { textbody: string; htmlbody: string },
      ];
      expect(message.textbody).toContain(
        'http://localhost:4200/auth/verify?token=raw-token',
      );
      expect(message.htmlbody).toContain('token=raw-token');
    });

    it('overwrites the payload of an account that was never verified', async () => {
      findByEmail.mockResolvedValue({
        id: 'existing-id',
        onboardingPayload: { ...payload, firstName: 'Stale' },
      });

      await service.register({ ...dto });
      await flush();

      expect(stashOnboardingPayload).toHaveBeenCalledWith(
        'existing-id',
        payload,
      );
      expect(createPending).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('changes nothing for a verified account, and still sends a link', async () => {
      findByEmail.mockResolvedValue({
        id: 'existing-id',
        onboardingPayload: null,
      });

      await service.register({ ...dto });
      await flush();

      expect(createPending).not.toHaveBeenCalled();
      expect(stashOnboardingPayload).not.toHaveBeenCalled();
      expect(issue).toHaveBeenCalledWith('existing-id');
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('converges on the winner when it loses the unique-index race', async () => {
      findByEmail
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'winner-id', onboardingPayload: payload });
      createPending.mockRejectedValue(
        new Error('UNIQUE constraint failed: users.email'),
      );

      await expect(service.register({ ...dto })).resolves.toBeUndefined();
      await flush();

      expect(stashOnboardingPayload).toHaveBeenCalledWith('winner-id', payload);
      expect(issue).toHaveBeenCalledWith('winner-id');
    });

    it('rethrows an insert failure that is not the email race', async () => {
      createPending.mockRejectedValue(new Error('disk full'));

      await expect(service.register({ ...dto })).rejects.toThrow('disk full');
      expect(issue).not.toHaveBeenCalled();
    });
  });

  describe('the category template check', () => {
    // The membership check `RegisterDto.categories` cannot do for itself now
    // that the offered list is a table rather than a constant with an enum.

    it('rejects an id that is not a live category template', async () => {
      templatesExist.mockResolvedValue([GROCERIES_ID]);

      await expect(service.register({ ...dto })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('names the missing id rather than only the count', async () => {
      templatesExist.mockResolvedValue([GROCERIES_ID]);

      await expect(service.register({ ...dto })).rejects.toThrow(TRANSPORT_ID);
    });

    it('creates no account and sends nothing when an id is unknown', async () => {
      // The check has to run *ahead* of the floated work, or the 400 arrives
      // after a link has already been mailed for an account that was created.
      templatesExist.mockResolvedValue([]);

      await expect(service.register({ ...dto })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await flush();

      expect(createPending).not.toHaveBeenCalled();
      expect(issue).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('asks exists(), not resolve(), so a colourless template is not an unknown id', async () => {
      // The distinction this whole method turns on. `resolve()` inner-joins the
      // colour and the icon, so a template whose colour an admin tombstoned
      // comes back missing from it - and reusing it here reported that template
      // as an unknown id and 400'd a registration over a chip the picker had
      // just offered. `exists()` reads `category_templates` alone.
      //
      // Asserted as "the service never reaches for resolve" rather than by
      // simulating the join, because a mock cannot fake an inner join and the
      // property that matters is which question is asked.
      const resolve = jest.fn();
      service = new AuthService(
        {
          findByEmail,
          createPending,
          stashOnboardingPayload,
        } as unknown as UsersService,
        { issue, ttlMinutes: 15 } as unknown as LoginTokenService,
        { send },
        {
          get: (_key: string, fallback: unknown) => fallback,
        } as unknown as ConfigService,
        { exists: templatesExist, resolve } as unknown as TemplatesService,
      );

      await service.register({ ...dto });
      await flush();

      expect(templatesExist).toHaveBeenCalledWith([GROCERIES_ID, TRANSPORT_ID]);
      expect(resolve).not.toHaveBeenCalled();
      expect(createPending).toHaveBeenCalled();
    });

    it('asks central nothing when no chips were picked', async () => {
      // An empty selection is legal (A4) and needs no lookup at all - which is
      // also what keeps the empty case off the unauthenticated route's clock.
      await service.register({ ...dto, categories: [] });
      await flush();

      expect(templatesExist).not.toHaveBeenCalled();
      expect(createPending).toHaveBeenCalledWith(
        'marko@email.com',
        expect.objectContaining({ categories: [] }),
      );
    });

    it('runs before the directory lookup, so it cannot time an address', async () => {
      const order: string[] = [];
      templatesExist.mockImplementation(() => {
        order.push('templates');
        return Promise.resolve([GROCERIES_ID, TRANSPORT_ID]);
      });
      findByEmail.mockImplementation(() => {
        order.push('directory');
        return Promise.resolve(null);
      });

      await service.register({ ...dto });
      await flush();

      expect(order[0]).toBe('templates');
    });
  });

  describe('requestLoginLink', () => {
    it('sends a link to an address that has an account', async () => {
      findByEmail.mockResolvedValue({
        id: 'existing-id',
        onboardingPayload: null,
      });

      await service.requestLoginLink('marko@email.com');
      await flush();

      expect(issue).toHaveBeenCalledWith('existing-id');
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('creates nothing and sends nothing for an unknown address', async () => {
      findByEmail.mockResolvedValue(null);

      await expect(
        service.requestLoginLink('nobody@email.com'),
      ).resolves.toBeUndefined();
      await flush();

      expect(createPending).not.toHaveBeenCalled();
      expect(issue).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('the floated send', () => {
    it('does not make the caller wait on the mailer', async () => {
      // Never settles. If the response awaited the send, this would hang and
      // the timing difference between a known and an unknown address would be
      // an HTTPS round trip wide.
      send.mockReturnValue(new Promise(() => undefined));

      await expect(service.register({ ...dto })).resolves.toBeUndefined();
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('logs a send failure instead of failing the request', async () => {
      send.mockRejectedValue(new Error('MailPace send failed'));

      await expect(service.register({ ...dto })).resolves.toBeUndefined();
      await flush();

      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('Sending a login link'),
      );
    });

    it('logs an issue failure the same way', async () => {
      issue.mockRejectedValue(new Error('database is locked'));

      await expect(service.register({ ...dto })).resolves.toBeUndefined();
      await flush();

      expect(send).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('database is locked'),
      );
    });
  });
});
