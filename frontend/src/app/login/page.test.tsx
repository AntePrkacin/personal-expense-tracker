import { redirect } from 'next/navigation';

import { hasSession } from '../../lib/session';

import Login from './page';
import { LoginScreen } from './LoginScreen';

// The route's own job, which as of PET-52 is more than returning a screen: it branches
// on a session first. Everything the screen does is LoginScreen.test.tsx's.
//
// Relative specifiers on the mocks, because `jest.mock` cannot resolve the `@/` alias
// from any directory - see the note in frontend/src/app/CLAUDE.md - and the import above
// names the same one. `./actions` is mocked so no assertion here can reach a real fetch
// through the screen's own import of it.
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
jest.mock('../../lib/session', () => ({ hasSession: jest.fn() }));
jest.mock('./actions', () => ({ sendLoginLink: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  (hasSession as jest.Mock).mockResolvedValue(false);
});

describe('the /login route', () => {
  // Awaited and inspected rather than rendered, which is what app/page.test.tsx does
  // with the same gate and for the same reason: the branch is the whole behaviour.

  it('shows Log in to a signed-out visitor', async () => {
    const rendered = await Login();

    expect(rendered?.type).toBe(LoginScreen);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sends a signed-in visitor to the Dashboard', async () => {
    // PET-12 left this ungated because a fourth call into the session stubs would have
    // been a claim nothing could test; the stubs are real now. Without it, a signed-in
    // user can request a link they do not need - the backend sends it and it works,
    // which is right rather than broken, just pointless.
    (hasSession as jest.Mock).mockResolvedValue(true);

    await Login();

    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('asks about the session exactly once', async () => {
    await Login();

    expect(hasSession).toHaveBeenCalledTimes(1);
  });

  it('declares no segment config, because the cookie read is what makes it dynamic', async () => {
    // /login prerendered static until this landed, and stopping is the point rather
    // than a regression - `lib/session.ts` predicted exactly this for `/`. An
    // `export const dynamic` here would be a claim about nothing.
    const segment: Record<string, unknown> = await import('./page');

    expect(segment.dynamic).toBeUndefined();
  });
});
