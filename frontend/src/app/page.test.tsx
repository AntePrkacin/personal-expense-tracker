import { redirect } from 'next/navigation';

// Relative rather than the `@/lib/session` alias, and it has to be: `jest.mock`
// cannot resolve that alias from anywhere, so the mock below uses a relative path
// and this import has to name the same specifier to read as one pair. See the note
// on the mock call.
import { hasSession } from '../lib/session';

import Home from './page';
import { WelcomeScreen } from './WelcomeScreen';

// `redirect` works by throwing, so it cannot be exercised for real under Jest: the
// thrown control-flow signal is caught by the App Router, which is not here.
// Mocking it turns "did the page choose the right destination" into an ordinary
// assertion, which is the only thing worth asserting about a page whose entire body
// is one branch.
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

// `hasSession` is mocked rather than left at its real value for one reason: its real
// value is a stub that always answers false, so the signed-in branch would be
// unreachable and untested until PET-52 - at which point somebody would be
// discovering this page for the first time.
//
// A relative specifier, because `jest.mock('@/lib/session')` fails with "Cannot
// find module". Note that is NOT about the `(app)` route group's parentheses, which
// is what layout.test.tsx used to say and what this file proved wrong: the resolved
// Jest config carries no moduleNameMapper entry for `@/*` and a null modulePaths,
// so the alias is unresolvable from `jest.mock` anywhere, parentheses or not. Plain
// imports work because SWC rewrites aliased specifiers at transform time from
// tsconfig `paths`, while `jest.mock`'s argument is a runtime string the resolver
// sees verbatim. The relative path resolves to the same module and Jest's registry
// keys on the resolved path, so this still intercepts page.tsx's aliased import.
jest.mock('../lib/session', () => ({ hasSession: jest.fn() }));

const mockHasSession = jest.mocked(hasSession);

describe('the root route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Welcome screen for a visitor with no session', async () => {
    mockHasSession.mockResolvedValue(false);

    const rendered = await Home();

    expect(redirect).not.toHaveBeenCalled();
    // The element's type rather than its markup: this page's only job is the
    // branch, and WelcomeScreen.test.tsx is what asserts what the screen contains.
    // Rendering it here would duplicate that suite and couple this one to copy.
    expect(rendered.type).toBe(WelcomeScreen);
  });

  it('sends a visitor with a live session to the dashboard', async () => {
    mockHasSession.mockResolvedValue(true);

    await Home();

    // Hard-coded rather than read from SIDEBAR_HREFS: this string and the sidebar's
    // own /dashboard href are two independent halves of the same contract, and a
    // shared constant would let them move together and stay wrong.
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('asks about the session exactly once', async () => {
    // Guards against a second read creeping in. Once PET-52 makes this a cookie
    // read plus a fetch, two calls are two round trips on the app's busiest route.
    mockHasSession.mockResolvedValue(false);

    await Home();

    expect(mockHasSession).toHaveBeenCalledTimes(1);
  });
});
