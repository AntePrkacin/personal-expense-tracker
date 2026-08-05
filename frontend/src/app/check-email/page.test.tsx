import { readPendingEmail } from '../../lib/pendingEmail';

import CheckEmail from './page';
import { CheckEmailScreen } from './CheckEmailScreen';

// The route's own job: read the cookie, hand the result down. Everything the screen
// does with it is CheckEmailScreen.test.tsx's.
//
// Both mocks use relative specifiers, because `jest.mock` cannot resolve the `@/`
// alias from any directory - see the note in frontend/src/app/CLAUDE.md.
jest.mock('../../lib/pendingEmail', () => ({ readPendingEmail: jest.fn() }));
jest.mock('../../lib/resend', () => ({ resendLoginLink: jest.fn() }));

const ADDRESS = 'marko@email.com';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the /check-email route', () => {
  // Awaited and inspected rather than rendered, which is what app/page.test.tsx does
  // with the session gate and for the same reason: the element it returns is the whole
  // of its behaviour, and rendering would only re-test the screen.

  it('reads the address from the cookie and passes it down', async () => {
    (readPendingEmail as jest.Mock).mockResolvedValue(ADDRESS);

    const rendered = await CheckEmail();

    expect(readPendingEmail).toHaveBeenCalledTimes(1);
    expect(rendered.type).toBe(CheckEmailScreen);
    expect(rendered.props.email).toBe(ADDRESS);
  });

  it('passes null through rather than substituting anything', async () => {
    // The fallback copy is the screen's decision, not this file's. A default applied
    // here would hide the no-address case from the component that has to render it.
    (readPendingEmail as jest.Mock).mockResolvedValue(null);

    const rendered = await CheckEmail();

    expect(rendered.props.email).toBeNull();
  });

  it('hands the resend action down when there is an address', async () => {
    // The screen takes it as a prop so that nothing it imports reaches next/headers.
    // If this file stopped passing it, the button would throw on click with every
    // other test here still green.
    (readPendingEmail as jest.Mock).mockResolvedValue(ADDRESS);

    const rendered = await CheckEmail();

    expect(typeof rendered.props.resend).toBe('function');
  });

  it('hands down no action when there is no address', async () => {
    // The screen's props are an exclusive union, so the combination that means nothing -
    // an action with nothing to send to - is a build error rather than an ignored prop.
    // This pins the call site's half of that.
    (readPendingEmail as jest.Mock).mockResolvedValue(null);

    const rendered = await CheckEmail();

    expect(rendered.props.resend).toBeUndefined();
  });
});
