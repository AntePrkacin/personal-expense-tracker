import { readPendingEmail } from '../../../../lib/pendingEmail';

import VerifyFailed from './page';
import { VerifyFailedScreen } from './VerifyFailedScreen';

// The route's own job: validate the reason, read the cookie, hand both down. Everything
// the screen does with them is VerifyFailedScreen.test.tsx's.
//
// Relative specifiers, because `jest.mock` cannot resolve the `@/` alias from any
// directory - see the note in frontend/src/app/CLAUDE.md - and the imports name the
// same ones.
jest.mock('../../../../lib/pendingEmail', () => ({ readPendingEmail: jest.fn() }));
jest.mock('../../../../lib/resend', () => ({ resendLoginLink: jest.fn() }));

const ADDRESS = 'marko@email.com';

beforeEach(() => {
  jest.clearAllMocks();
  (readPendingEmail as jest.Mock).mockResolvedValue(ADDRESS);
});

describe('the /auth/verify/failed route', () => {
  // Awaited and inspected rather than rendered, which is what `app/check-email`'s own
  // route test does and for the same reason: the element it returns is the whole of its
  // behaviour, and rendering would only re-test the screen.

  it('passes the reason the handler chose', async () => {
    const rendered = await VerifyFailed({
      searchParams: Promise.resolve({ reason: 'superseded' }),
    });

    expect(rendered.type).toBe(VerifyFailedScreen);
    expect(rendered.props.reason).toBe('superseded');
  });

  it('offers the resend when an address is still stashed', async () => {
    const rendered = await VerifyFailed({ searchParams: Promise.resolve({ reason: 'invalid' }) });

    expect(rendered.props.hasAddress).toBe(true);
    expect(rendered.props.resend).toBeDefined();
  });

  it('withholds the action when there is nothing to resend to', async () => {
    // The likely arrival rather than the exotic one: a dead link opened the next morning
    // comes with a dead fifteen-minute cookie too.
    (readPendingEmail as jest.Mock).mockResolvedValue(null);

    const rendered = await VerifyFailed({ searchParams: Promise.resolve({ reason: 'invalid' }) });

    expect(rendered.props.hasAddress).toBe(false);
    expect(rendered.props.resend).toBeUndefined();
  });

  it('never hands the address itself to the screen', async () => {
    // The screen does not take one, and this is the assertion that keeps it that way:
    // the address is a detail nobody asked about on a screen delivering bad news.
    const rendered = await VerifyFailed({ searchParams: Promise.resolve({ reason: 'invalid' }) });

    expect(JSON.stringify(rendered.props)).not.toContain(ADDRESS);
  });

  it.each([
    ['a hand-typed reason', 'expired'],
    ['no reason at all', undefined],
  ])('falls back to the generic copy for %s', async (_label, reason) => {
    // The parameter is typed by whoever holds the address bar and lands in a heading.
    const rendered = await VerifyFailed({ searchParams: Promise.resolve({ reason }) });

    expect(rendered.props.reason).toBe('failed');
  });
});
