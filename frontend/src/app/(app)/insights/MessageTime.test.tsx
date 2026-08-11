import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MessageTime } from './MessageTime';

// One chat row's timestamp (PET-76).
//
// **This suite is unusual in rendering the component twice through two different renderers**, and
// that is the whole point of it: the defect it guards is a *disagreement* between the server pass
// and the client pass, so a suite that only ever renders one of them cannot see it. `render` is the
// client half and `renderToStaticMarkup` is the server half.
//
// What went wrong without it is worth stating, because the broken version passed every gate. A
// locale-formatted time rendered on the server uses the server's zone - UTC on Vercel - and the same
// call in the browser uses the reader's. `suppressHydrationWarning` silences the mismatch and keeps
// the **server's** text, which a browser walk measured directly: an instant of `18:36:47Z` rendered
// as "6:36 PM" and stayed there in a `Europe/Zagreb` browser where it is 8:36 PM. Off by the
// reader's own offset, on the one screen where the times are the point, with a clean console.

const INSTANT = '2026-08-11T18:36:47.707Z';

describe('the client pass', () => {
  it('renders the formatted timestamp', () => {
    render(<MessageTime instant={INSTANT} />);

    // Deliberately not asserting a literal clock reading: the suite runs in whatever zone the
    // machine is in, and pinning "8:36 PM" would make this test a fact about CI's `TZ`. What has to
    // hold is that a time was rendered at all, with a day part in front of it.
    expect(
      screen.getByText(/^(Today|Yesterday|[A-Z][a-z]{2} \d{1,2}), \d{1,2}:\d{2}\s?(AM|PM)$/),
    ).toBeInTheDocument();
  });

  it('keeps the machine-readable instant on the element', () => {
    const { container } = render(<MessageTime instant={INSTANT} />);

    expect(container.querySelector('time')).toHaveAttribute('datetime', INSTANT);
  });
});

describe('the server pass', () => {
  it('renders no time text at all, so there is nothing for hydration to keep', () => {
    // **The regression test for the defect above.** If this ever emits a formatted time again, the
    // server's zone is back in the markup and the reader's browser will not correct it.
    const html = renderToStaticMarkup(<MessageTime instant={INSTANT} />);

    // **Asserted as "the element is empty" rather than against exact markup**, which an earlier
    // version of this test got wrong: `renderToStaticMarkup` emits the attribute as `dateTime`
    // rather than lowercasing it to `datetime`. That is harmless - HTML attribute names are
    // case-insensitive and the browser reads it either way, confirmed in the walk - but pinning the
    // string made this suite a test of React's serializer instead of of this component.
    expect(html).toMatch(/^<time [^>]*><\/time>$/i);
    expect(html).not.toMatch(/AM|PM/);
  });

  it('still publishes the instant, so the value is in the markup from the first byte', () => {
    expect(renderToStaticMarkup(<MessageTime instant={INSTANT} />)).toContain(INSTANT);
  });
});
