import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LastActiveTime } from './LastActiveTime';

// One History row's relative day (a review of PR #92).
//
// **This suite renders through two renderers for `MessageTime.test.tsx`'s reason**, and that file
// carries the argument: the defect is a *disagreement* between the server pass and the client pass,
// so a suite performing only one of them cannot see it. `render` is the client half and
// `renderToStaticMarkup` is the server half.
//
// What went wrong here is the same bug reached from the other side. PET-76 made the chat row's
// timestamp client-only so it resolves `today` in the reader's zone; this caption stayed
// server-rendered inside a Server Component, so it resolved `today` in the frontend host's - and
// because both had been made to share `calendarDateOfInstant`, `formatMessageTimestamp`'s docblock
// asserted in as many words that the two could not disagree. With the frontend at `TZ=UTC` against a
// `Europe/Zagreb` reader, a message at `2026-08-12T23:00:00Z` read at `01:00Z` was "Today" on its row
// and "Yesterday" in this list.

const INSTANT = '2026-08-10T09:00:00.000Z';
const TODAY = '2026-08-11';

describe('the client pass', () => {
  it('renders the relative day', () => {
    render(<LastActiveTime instant={INSTANT} today={TODAY} />);

    expect(screen.getByText('Yesterday')).toBeInTheDocument();
  });

  it('reads the instant in the zone `today` is read in', () => {
    // The bounds are built from **local** parts, which is `AssistantHistoryScreen.test.tsx`'s own
    // call and for its reason: 00:30 catches a host ahead of UTC (the instant lands on the previous
    // UTC day) and 23:30 one behind it. Neither can catch anything in UTC itself, where the two
    // dates never differ - worth knowing before reading a green run here as proof on a UTC frontend.
    for (const local of [new Date(2026, 7, 11, 0, 30), new Date(2026, 7, 11, 23, 30)]) {
      const { unmount } = render(<LastActiveTime instant={local.toISOString()} today={TODAY} />);

      expect(screen.getByText('Today')).toBeInTheDocument();
      unmount();
    }
  });

  it('keeps the machine-readable instant on the element', () => {
    const { container } = render(<LastActiveTime instant={INSTANT} today={TODAY} />);

    expect(container.querySelector('time')).toHaveAttribute('datetime', INSTANT);
  });
});

describe('the server pass', () => {
  it('renders no relative day at all, so the server never decides which day it was', () => {
    // **The regression test for the defect above.** If this ever emits a day again, that day was
    // computed against the *server's* clock and zone, and nothing in the reader's browser corrects
    // it - there is no hydration mismatch to warn about, because this screen renders on the server
    // and stays there. That is what made the original version invisible to every gate.
    const html = renderToStaticMarkup(<LastActiveTime instant={INSTANT} today={TODAY} />);

    // Asserted as "the element is empty" rather than against exact markup, which
    // `MessageTime.test.tsx` records the reason for: `renderToStaticMarkup` emits `dateTime` rather
    // than lowercasing it, and pinning the string makes the suite a test of React's serializer.
    expect(html).toMatch(/^<time [^>]*><\/time>$/i);
    expect(html).not.toMatch(/Today|Yesterday|Aug/);
  });

  it('still publishes the instant, so the value is in the markup from the first byte', () => {
    expect(renderToStaticMarkup(<LastActiveTime instant={INSTANT} today={TODAY} />)).toContain(
      INSTANT,
    );
  });
});
