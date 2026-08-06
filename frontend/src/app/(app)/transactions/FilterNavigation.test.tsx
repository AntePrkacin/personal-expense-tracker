import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FilterNavigationProvider, PendingRegion, useFilterNavigation } from './FilterNavigation';

// The provider exists because the pending affordance had nowhere to live: the table is a
// Server Component and the flag is a client one, so an earlier version gave the table a
// `pending` prop that no caller could pass. It was documented, tested and dead - the tests set
// the prop by hand, so they would have stayed green whatever the wiring did.
//
// **These assertions are therefore about reachability, not about the class.** They drive a
// real navigation through the real provider and check that the region reacts.

const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));

/** A control shaped like the real ones: it navigates through the context. */
function Control({ href, scroll }: { href: string; scroll?: boolean }) {
  const { navigate } = useFilterNavigation();

  return (
    <button
      type="button"
      onClick={() => navigate(href, scroll === undefined ? undefined : { scroll })}
    >
      Filter
    </button>
  );
}

function renderScreen(scroll?: boolean) {
  const user = userEvent.setup();

  render(
    <FilterNavigationProvider>
      <Control href="/transactions?period=all" scroll={scroll} />
      <PendingRegion>
        <table>
          <caption>Transactions</caption>
          <tbody>
            <tr>
              <td>Whole Foods</td>
            </tr>
          </tbody>
        </table>
      </PendingRegion>
    </FilterNavigationProvider>,
  );

  return { user };
}

/** The region is the element carrying aria-busy, which is the table's wrapper. */
const region = () => screen.getByRole('table', { name: 'Transactions' }).parentElement;

beforeEach(() => {
  replace.mockClear();
});

describe('navigating', () => {
  it('replaces rather than pushes', async () => {
    const { user } = renderScreen();

    await user.click(screen.getByRole('button', { name: 'Filter' }));

    expect(replace).toHaveBeenCalledWith('/transactions?period=all');
  });

  it('forwards a caller’s options', async () => {
    const { user } = renderScreen(false);

    await user.click(screen.getByRole('button', { name: 'Filter' }));

    expect(replace).toHaveBeenCalledWith('/transactions?period=all', { scroll: false });
  });

  it('omits the second argument entirely when a caller gave none', async () => {
    // So "opted out of scrolling" stays distinguishable from "said nothing".
    const { user } = renderScreen();

    await user.click(screen.getByRole('button', { name: 'Filter' }));

    expect(replace.mock.calls[0]).toHaveLength(1);
  });
});

describe('the pending region', () => {
  it('says nothing at rest', () => {
    // `aria-busy="false"` on every idle render would be noise, so the attribute is absent.
    renderScreen();

    expect(region()).not.toHaveAttribute('aria-busy');
    expect(region()).not.toHaveClass('opacity-60');
  });

  it('carries the class the dimming toggles, so the region is really in the tree', () => {
    // `transition-opacity` is present in both states, which makes it the one thing that can be
    // asserted about this wrapper from jsdom - and asserting it is not nothing: the bug this
    // component was written to fix was a pending affordance that existed in a file and was
    // wired to nothing at all.
    renderScreen();

    expect(region()).toHaveClass('transition-opacity');
  });

  // **`isPending` turning true is not assertable here, and faking it would test the fake.**
  // A transition only stays pending while something inside it suspends; in the real app that
  // is `router.replace` suspending on the RSC payload. A mocked router resolves immediately,
  // so `startTransition`'s callback completes synchronously and `isPending` is false again
  // before any assertion can run. Rewriting `navigate` into an async transition purely so a
  // test could observe it would be contorting the component to suit the harness.
  //
  // This is the same class of gap `(app)/Modal.tsx` records for Escape and its focus trap, and
  // the same answer applies: it is a browser check. `docs/TODO.md` carries it. What this file
  // *can* pin is everything either side of it - that the region is mounted, that it is silent
  // at rest, and that the control reaches the provider at all.
});

describe('using the hook outside the provider', () => {
  it('throws rather than silently not navigating', () => {
    // The call `AddTransactionProvider` makes, and for the same reason: a control that quietly
    // stops navigating is a bug that looks like a slow network.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Control href="/transactions" />)).toThrow(
      /must be used inside a FilterNavigationProvider/,
    );

    consoleError.mockRestore();
  });
});
