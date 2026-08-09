import { render, screen } from '@testing-library/react';

import { category, UNCAPPED_CATEGORY } from './categoryFixture';
import { CategoryCard } from './CategoryCard';

// One card, in every status the contract can hand it (AC2, AC3, AC7).
//
// The figures are the frame's own, so a reviewer can hold this file beside node 36:423:
// Groceries is `near`, Dining out is `over`, Housing is `full` and the rest are `on_track`.
// `Uncategorized` supplies the uncapped shape, which the frame does not draw at all.
//
// **The kebab's context is mocked rather than wrapped in the real provider**, which is the
// opposite of what `transactions/TransactionRow.test.tsx` does, and the reason is what each suite
// is about. That one renders a row inside both real providers because the row is the thing the
// providers exist to serve. This file is about what the *card* draws in five states, and every one
// of its seventeen renders would otherwise have to be wrapped to reach an opener no assertion
// here touches. The menu's own wiring - the popover pairing, Edit's disabled state, the payload
// Delete sends, and the fallback row's missing Delete - is `CategoryCardMenu.test.tsx`'s.
//
// A relative specifier, because `jest.mock('@/...')` fails with "Cannot find module" from
// anywhere in this repo.
jest.mock('./DeleteCategoryProvider', () => ({
  useDeleteCategory: () => ({ open: jest.fn() }),
}));

const bar = () => screen.getByRole('progressbar');

describe('a capped category (AC2)', () => {
  it('shows spent of cap, the chip, the bar and the footer', () => {
    render(<CategoryCard category={category()} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Groceries' })).toBeInTheDocument();
    expect(screen.getByText('$397')).toBeInTheDocument();
    expect(screen.getByText('of $500')).toBeInTheDocument();
    expect(screen.getByText('Near')).toBeInTheDocument();
    expect(screen.getByText('$103 left')).toBeInTheDocument();
    expect(screen.getByText('24 transactions')).toBeInTheDocument();
  });

  it('gives the bar a real accessible name and a floored value', () => {
    // Floored rather than rounded, which is the rule `categoryCardStatus.ts` exists to hold:
    // 79.4 must not become 80 and cross a band the status did not.
    render(<CategoryCard category={category()} />);

    expect(bar()).toHaveAttribute('aria-label', 'Groceries budget used');
    expect(bar()).toHaveValue(79);
  });

  it('clamps the bar at its max when the category is over budget', () => {
    // A <progress> handed a value above its max renders full but reports the raw number to
    // assistive technology, so the clamp is an accessibility fix rather than a cosmetic one.
    render(
      <CategoryCard
        category={category({
          name: 'Dining out',
          monthlyCap: 300,
          spent: 312,
          percentUsed: 104,
          remaining: null,
          over: 12,
          status: 'over',
        })}
      />,
    );

    expect(bar()).toHaveValue(100);
  });
});

describe('the status chip and the footer figure (AC3)', () => {
  it('reads "On track" below 75%', () => {
    render(
      <CategoryCard
        category={category({ percentUsed: 63.7, remaining: 127, status: 'on_track' })}
      />,
    );

    expect(screen.getByText('On track')).toBeInTheDocument();
    expect(screen.getByText('$127 left')).toBeInTheDocument();
  });

  it('reads "Near" between 75 and 99%', () => {
    render(<CategoryCard category={category()} />);

    expect(screen.getByText('Near')).toBeInTheDocument();
    expect(screen.getByText('$103 left')).toBeInTheDocument();
  });

  it('reads "Full" with "$0 over" at exactly the cap', () => {
    // **The boundary CTG-6 and A28 pin, and the one that cannot be derived from `remaining`.**
    // At the cap `remaining` is an ordinary 0, so a card reading it would print "$0 left" - a
    // true sentence the design deliberately does not use. Housing on the frame is this case.
    render(
      <CategoryCard
        category={category({
          name: 'Housing',
          monthlyCap: 1100,
          spent: 1100,
          percentUsed: 100,
          remaining: 0,
          over: null,
          status: 'full',
        })}
      />,
    );

    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByText('$0 over')).toBeInTheDocument();
    expect(screen.queryByText('$0 left')).not.toBeInTheDocument();
  });

  it('reads "Over" with the over amount above the cap', () => {
    render(
      <CategoryCard
        category={category({
          name: 'Dining out',
          monthlyCap: 300,
          spent: 312,
          percentUsed: 104,
          remaining: null,
          over: 12,
          status: 'over',
        })}
      />,
    );

    expect(screen.getByText('Over')).toBeInTheDocument();
    expect(screen.getByText('$12 over')).toBeInTheDocument();
  });

  it('does not carry the band by colour alone', () => {
    // `near` and `full` share `warning`, so the label is the only thing separating them. Both
    // are real text in the badge, which is what keeps that legitimate - this asserts the two
    // words differ rather than asserting a class, per the standing rule about class strings.
    const { unmount } = render(<CategoryCard category={category({ status: 'near' })} />);
    expect(screen.getByText('Near')).toBeInTheDocument();
    unmount();

    render(<CategoryCard category={category({ status: 'full', over: null })} />);
    expect(screen.getByText('Full')).toBeInTheDocument();
  });
});

describe('the transaction count, pluralized (AC2)', () => {
  it('says "1 transaction" for one', () => {
    // Frame 13's Housing card reads "1 transactions", which CTG-6 records as a typo. This is
    // the assertion that keeps the fix from being "corrected" back toward the mock.
    render(<CategoryCard category={category({ transactionCount: 1 })} />);

    expect(screen.getByText('1 transaction')).toBeInTheDocument();
  });

  it('says "0 transactions" for none', () => {
    render(<CategoryCard category={category({ transactionCount: 0 })} />);

    expect(screen.getByText('0 transactions')).toBeInTheDocument();
  });
});

describe('an uncapped category (AC7)', () => {
  it('shows spend and count instead of a cap', () => {
    render(<CategoryCard category={UNCAPPED_CATEGORY} />);

    expect(screen.getByText('$148')).toBeInTheDocument();
    expect(screen.getByText('in 6 transactions')).toBeInTheDocument();
  });

  it('draws no bar and no chip at all', () => {
    // Not "a chip with no colour" - no chip. The whole reason the card has two shapes is that
    // there is no cap to draw furniture against, and `status: "uncapped"` is the common case
    // rather than the edge: caps are optional and the preselected fallback ships without one.
    render(<CategoryCard category={UNCAPPED_CATEGORY} />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
    expect(screen.queryByText('Near')).not.toBeInTheDocument();
    expect(screen.queryByText('Full')).not.toBeInTheDocument();
    expect(screen.queryByText('Over')).not.toBeInTheDocument();
  });

  it('never prints a null cap', () => {
    // The failure this shape exists to prevent, stated directly.
    render(<CategoryCard category={UNCAPPED_CATEGORY} />);

    expect(screen.queryByText(/of \$?null/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('offers to set a limit, announcing that the control is not live yet', () => {
    render(<CategoryCard category={UNCAPPED_CATEGORY} />);

    const setLimit = screen.getByRole('button', { name: 'Set limit for Uncategorized' });

    expect(setLimit).toHaveAttribute('aria-disabled', 'true');
    // Not `disabled`: that removes it from the tab order, so the control would be unreachable
    // by keyboard and announce nothing. PET-38 is what makes it live.
    expect(setLimit).not.toBeDisabled();
  });

  it('keeps the visible label inside the accessible name (WCAG 2.5.3)', () => {
    // **The name must *contain* "Set limit", not merely identify the control.** It read "Set a
    // monthly limit for Uncategorized", which is distinct across eight cards and unusable by
    // speech input: a user saying "click Set limit" - the only words on screen - matched
    // nothing, on the one affordance an uncapped card has.
    render(<CategoryCard category={UNCAPPED_CATEGORY} />);

    const name = screen.getByRole('button', { name: /Set limit/ }).getAttribute('aria-label');

    expect(name).toContain('Set limit');
    expect(name).toContain('Uncategorized');
  });

  it('falls back to a capped-looking status with no cap without drawing furniture', () => {
    // Defensive, and the contract is why: every derived field is nullable independently of
    // `status`, so a row claiming `near` with a null `monthlyCap` is representable. The card
    // must not then print "of null" - `isCapped` tests both.
    render(<CategoryCard category={category({ monthlyCap: null, status: 'near' })} />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/of \$?null/)).not.toBeInTheDocument();
  });
});

describe('the kebab (AC6)', () => {
  // **Inverted by PET-39, which built the menu this card was drawing a placeholder for.** These
  // cases used to assert `aria-disabled="true"` and that nothing opened; both are now false by
  // design. What the card still owns is that the control is present, named per card and drawn on
  // both shapes. Everything behind it is `CategoryCardMenu.test.tsx`'s.

  it('is present and named per card', () => {
    render(<CategoryCard category={category()} />);

    expect(screen.getByRole('button', { name: 'Actions for Groceries' })).toBeInTheDocument();
  });

  it('no longer announces itself as unavailable', () => {
    render(<CategoryCard category={category()} />);

    const kebab = screen.getByRole('button', { name: 'Actions for Groceries' });

    expect(kebab).not.toHaveAttribute('aria-disabled');
    expect(kebab).toBeEnabled();
  });

  it('opens a menu offering Edit and Delete', () => {
    render(<CategoryCard category={category()} />);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('is drawn on the uncapped shape too', () => {
    // Both shapes render `CategoryCardHeader`, so this is cheap insurance against a future edit
    // moving the kebab into the capped branch alone.
    render(<CategoryCard category={UNCAPPED_CATEGORY} />);

    expect(screen.getByRole('button', { name: 'Actions for Uncategorized' })).toBeInTheDocument();
  });
});
