import { screen, within } from '@testing-library/react';

import { render } from '../shellRender';

import { CategoryDonut } from './CategoryDonut';
import { LegendRow } from './CategoryHover';

// Node 21:4's own five categories (DSH-8), whose percentages are the ones that naively round
// to 99 - so the apportionment is exercised by the default fixture rather than only by a
// contrived one.
const FIVE_CATEGORIES = [
  {
    id: 'c1',
    name: 'Groceries',
    color: 'success' as const,
    icon: 'shopping-basket' as const,
    spent: 397,
    percent: 32.4,
  },
  {
    id: 'c2',
    name: 'Dining out',
    color: 'error' as const,
    icon: 'utensils' as const,
    spent: 298,
    percent: 24.3,
  },
  {
    id: 'c3',
    name: 'Transport',
    color: 'info' as const,
    icon: 'car' as const,
    spent: 223,
    percent: 18.2,
  },
  {
    id: 'c4',
    name: 'Shopping',
    color: 'secondary' as const,
    icon: 'shopping-basket' as const,
    spent: 174,
    percent: 14.2,
  },
  {
    id: 'c5',
    name: 'Other',
    color: 'warning-content' as const,
    icon: 'shopping-basket' as const,
    spent: 148,
    percent: 10.9,
  },
];

const TOTAL = 1240;

// ---------------------------------------------------------------------------
// What this file may claim, and what it may not.
//
// jsdom runs no layout, and `jest.setup.ts` hands the chart an invented 400x300 box so Recharts
// renders at all. So every arc here has a geometry that came from a constant: **no assertion
// below reads an angle, a radius or a size.** That the ring closes is a browser check, measured
// off the rendered paths, and `frontend/CLAUDE.md` records why.
//
// What is honestly assertable is everything that is not geometry, and for this card that happens
// to include the two things the requirement is actually about: one slice per category, and the
// legend's percentages summing to 100.
// ---------------------------------------------------------------------------

const legendRows = () => screen.getAllByRole('listitem');

// The percentage is the row's last cell. Read from that element rather than by matching `%` in
// the row's whole text, which runs the amount and the percent together - "$397" beside "33%"
// gives "Groceries$39733%", and a `/(\d+)%/` over that captures 39733.
const percentsFromLegend = () =>
  legendRows().map((row) => Number((row.lastElementChild?.textContent ?? '').replace('%', '')));

describe('the ring (AC1)', () => {
  it('draws one slice per category', () => {
    const { container } = render(
      <CategoryDonut currency="USD" categories={FIVE_CATEGORIES} spent={TOTAL} />,
    );

    expect(container.querySelectorAll('.recharts-pie-sector')).toHaveLength(5);
  });

  it('gives every slice its category colour as a CSS variable, never a class', () => {
    // A Tailwind class in an SVG `fill` resolves to nothing at all: the slice simply never
    // paints, with no error anywhere. That is the failure `CATEGORY_FILL` exists to prevent.
    const { container } = render(
      <CategoryDonut currency="USD" categories={FIVE_CATEGORIES} spent={TOTAL} />,
    );
    const fills = Array.from(container.querySelectorAll('.recharts-pie-sector path')).map((s) =>
      s.getAttribute('fill'),
    );

    expect(fills).toEqual([
      'var(--color-success)', // Groceries
      'var(--color-error)', // Dining out
      'var(--color-info)', // Transport
      'var(--color-secondary)', // Shopping
      'var(--color-warning-content)', // Other
    ]);
  });

  it('falls back to grey for a colour it cannot resolve rather than dropping the slice', () => {
    // Dropping it would make the ring not close, which is the one thing this card must not do.
    //
    // **The unresolvable case narrowed at PET-64 and this fixture had to move with it.** It
    // used to be the `Uncategorized` fallback, whose `#98A0AE` was deliberately outside the
    // eight-colour palette; that category carries `warning-content` now and resolves like any
    // other. What is left is a stored value the contract's enum does not contain - a row
    // predating the change, or a contract and a frontend that drifted - so the fixture is a
    // hex, which is exactly what such a row would hold. `as never` because the prop is the
    // contract's union and this deliberately violates it.
    const { container } = render(
      <CategoryDonut
        currency="USD"
        categories={[
          {
            id: 'c1',
            name: 'Groceries',
            color: 'success' as const,
            icon: 'shopping-basket' as const,
            spent: 60,
            percent: 60,
          },
          {
            id: 'c2',
            name: 'Stale',
            color: '#98A0AE' as never,
            icon: null,
            spent: 40,
            percent: 40,
          },
        ]}
        spent={100}
      />,
    );

    expect(container.querySelectorAll('.recharts-pie-sector')).toHaveLength(2);
    expect(container.querySelectorAll('.recharts-pie-sector path')[1]?.getAttribute('fill')).toBe(
      'color-mix(in oklab, var(--color-base-content) 50%, transparent)',
    );
  });

  it('draws that fallback slice in something other than the card it sits on', () => {
    // `base-300` is the theme's own empty-surface token and measures 1.157:1 in light against a
    // `bg-base-100` card - the tone PET-22 measured and rejected for the trend chart's muted
    // bars. The fold routes real money into this slice, so drawing it invisible is the ring
    // failing to close by another route. This asserts the negative, since the positive is a
    // browser measurement rather than a string.
    const { container } = render(
      <CategoryDonut
        currency="USD"
        categories={[
          {
            id: 'c1',
            name: 'Stale',
            color: '#98A0AE' as never,
            icon: null,
            spent: 40,
            percent: 100,
          },
        ]}
        spent={40}
      />,
    );

    const fill = container.querySelector('.recharts-pie-sector path')?.getAttribute('fill') ?? '';
    expect(fill).not.toContain('base-300');
    expect(fill).not.toContain('base-100');
  });

  it('separates the arcs with a seam, so two same-coloured slices cannot merge', () => {
    // **Reachable for a different reason since PET-64, and still reachable.** It used to be
    // that `orange` and `yellow` both resolved to `var(--color-warning)`, so the eight colour
    // words collapsed onto six hues. Every token is its own colour now, but two categories
    // can still carry the *same* token - nothing stops a user picking one twice, and three
    // seeded pairs are deliberately close enough to read as one anyway. Without a stroke the
    // ring shows one arc where the legend lists two.
    const { container } = render(
      <CategoryDonut
        currency="USD"
        categories={[
          {
            id: 'c1',
            name: 'A',
            color: 'warning' as const,
            icon: 'shopping-basket' as const,
            spent: 60,
            percent: 60,
          },
          {
            id: 'c2',
            name: 'B',
            color: 'warning' as const,
            icon: 'shopping-basket' as const,
            spent: 40,
            percent: 40,
          },
        ]}
        spent={100}
      />,
    );

    const sectors = Array.from(container.querySelectorAll('.recharts-pie-sector path'));
    expect(sectors.map((s) => s.getAttribute('fill'))).toEqual([
      'var(--color-warning)',
      'var(--color-warning)',
    ]);
    for (const sector of sectors) {
      expect(sector.getAttribute('stroke')).toBe('var(--color-base-100)');
    }
  });
});

describe('the legend (AC3, AC4)', () => {
  it('runs largest first with a name, an amount and a percentage on every row', () => {
    render(<CategoryDonut currency="USD" categories={FIVE_CATEGORIES} spent={TOTAL} />);
    const rows = legendRows();

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => within(row).getByText(/^[A-Z]/).textContent)).toEqual([
      'Groceries',
      'Dining out',
      'Transport',
      'Shopping',
      'Other',
    ]);
    expect(rows[0]?.textContent).toContain('$397');
    expect(rows[0]?.textContent).toContain('%');
  });

  it('sorts by spend even when the response arrives in another order', () => {
    // The contract publishes no order, so this card must not read one off the response.
    render(
      <CategoryDonut currency="USD" categories={[...FIVE_CATEGORIES].reverse()} spent={TOTAL} />,
    );

    expect(legendRows()[0]?.textContent).toContain('Groceries');
  });

  // The requirement, stated directly.
  it('shows percentages that sum to exactly 100', () => {
    render(<CategoryDonut currency="USD" categories={FIVE_CATEGORIES} spent={TOTAL} />);

    expect(percentsFromLegend().reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('sums to 100 for a set that would naively round to 101 too', () => {
    render(
      <CategoryDonut
        currency="USD"
        categories={[
          {
            id: 'a',
            name: 'A',
            color: 'success' as const,
            icon: 'shopping-basket' as const,
            spent: 306,
            percent: 30.6,
          },
          {
            id: 'b',
            name: 'B',
            color: 'error' as const,
            icon: 'shopping-basket' as const,
            spent: 306,
            percent: 30.6,
          },
          {
            id: 'c',
            name: 'C',
            color: 'info' as const,
            icon: 'shopping-basket' as const,
            spent: 196,
            percent: 19.6,
          },
          {
            id: 'd',
            name: 'D',
            color: 'secondary' as const,
            icon: 'shopping-basket' as const,
            spent: 192,
            percent: 19.2,
          },
        ]}
        spent={1000}
      />,
    );

    expect(percentsFromLegend().reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('gives a single category the whole circle', () => {
    render(
      <CategoryDonut
        currency="USD"
        categories={[
          {
            id: 'c1',
            name: 'Groceries',
            color: 'success' as const,
            icon: 'shopping-basket' as const,
            spent: 40,
            percent: 100,
          },
        ]}
        spent={40}
      />,
    );

    expect(percentsFromLegend()).toEqual([100]);
  });
});

describe('the centre readout (AC2)', () => {
  it('shows the period total over its caption', () => {
    render(<CategoryDonut currency="USD" categories={FIVE_CATEGORIES} spent={TOTAL} />);

    expect(screen.getByText('$1,240')).toBeInTheDocument();
    expect(screen.getByText('Total spent')).toBeInTheDocument();
  });

  // "Cannot disagree" is a property of the current wiring rather than a law: both cards read the
  // same field off the same response through the same formatter. If a later ticket ever gives
  // this card its own read, this is the assertion that notices.
  it('formats it exactly as BudgetCard formats the same field', () => {
    render(<CategoryDonut currency="USD" categories={FIVE_CATEGORIES} spent={1240.5} />);

    expect(screen.getByText('$1,241')).toBeInTheDocument();
  });

  it('leaves the total outside the hidden subtree, since nothing else on the card states it', () => {
    // The legend is a superset of the *tooltip*, which is what makes hiding the ring acceptable -
    // but it is not a superset of this. No legend row carries the period total, so hiding this
    // pair with the ring would leave AC2's figure on no accessible surface at all.
    //
    // RTL queries read through `aria-hidden`, so both assertions above pass with this defect
    // present. Only the containment says which.
    render(<CategoryDonut currency="USD" categories={FIVE_CATEGORIES} spent={TOTAL} />);

    expect(screen.getByText('$1,240').closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByText('Total spent').closest('[aria-hidden="true"]')).toBeNull();
  });
});

describe('display only', () => {
  it('has no interactive role and nothing in the tab order', () => {
    const { container } = render(
      <CategoryDonut currency="USD" categories={FIVE_CATEGORIES} spent={TOTAL} />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[tabindex]:not([tabindex="-1"])')).toHaveLength(0);
    expect(container.querySelectorAll('[role="application"]')).toHaveLength(0);
  });

  it('hides the ring from assistive technology, since the legend already carries every fact', () => {
    const { container } = render(
      <CategoryDonut currency="USD" categories={FIVE_CATEGORIES} spent={TOTAL} />,
    );

    const chart = container.querySelector('.recharts-responsive-container');
    expect(chart?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('leaves the legend outside that hidden subtree', () => {
    // The whole reason hiding the ring is acceptable. If the legend went with it the card would
    // announce nothing at all.
    render(<CategoryDonut currency="USD" categories={FIVE_CATEGORIES} spent={TOTAL} />);

    for (const row of legendRows()) {
      expect(row.closest('[aria-hidden="true"]')).toBeNull();
    }
  });
});

describe('the empty state (AC4, PET-26)', () => {
  it('draws the gray ring and the $0 centre for a genuinely empty account', () => {
    render(<CategoryDonut currency="USD" categories={[]} spent={0} />);

    expect(screen.getByRole('img', { name: /no spending recorded/i })).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getByText('Total spent')).toBeInTheDocument();
    expect(
      screen.getByText('Your category breakdown appears here once you start spending.'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('is named rather than hidden, unlike the populated ring', () => {
    // There is no legend below to act as this ring's accessible equivalent, so it needs a real
    // name of its own instead of `aria-hidden`.
    const { container } = render(<CategoryDonut currency="USD" categories={[]} spent={0} />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('reaches the same treatment through the dangling-category race, with real spend on it', () => {
    // `categories.length === 0` is a strict superset of the screen-wide empty state: an account
    // whose transactions' categories are all gone reaches this guard with `spent` still nonzero,
    // and the centre must say so rather than falsely reading "$0".
    render(<CategoryDonut currency="USD" categories={[]} spent={124} />);

    expect(screen.getByText('$124')).toBeInTheDocument();
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
  });

  it('does not tell that account nothing has been spent, in the caption or in the ring', () => {
    // The review finding. The centre figure branched on `spent` from the start and the two
    // strings around it did not, so this exact input rendered "$124 / Total spent" beside a
    // caption saying spending had not started - and the ring's name, which is the whole of what
    // that region announces, carried only the false half.
    render(<CategoryDonut currency="USD" categories={[]} spent={124} />);

    expect(
      screen.getByRole('img', { name: 'No category breakdown available' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This period's spending is not attributed to any category."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/once you start spending/)).not.toBeInTheDocument();
  });

  it("keeps frame 05's own copy for the account that really has spent nothing", () => {
    // The branch above must not swallow the designed state: `spent: 0` is the true empty
    // account and still reads exactly as the frame draws it.
    render(<CategoryDonut currency="USD" categories={[]} spent={0} />);

    expect(
      screen.getByRole('img', { name: 'No spending recorded this period' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not attributed to any category/)).not.toBeInTheDocument();
  });
});

describe('the hover association (PET-78)', () => {
  // What the *paint* does is a browser check and deliberately not asserted here: jsdom runs no
  // layout, and the highlight is a background colour rather than a daisyUI state class with an
  // aria attribute to pin it against. `docs/plans/2026-08-12_PET-78_dashboard-ui-ux-fixups.md`
  // carries what the walk measures. What is assertable is that the tooltip is gone and that the
  // wiring is not silently absent.

  it('renders no tooltip, since the legend states every fact one could', () => {
    // The tooltip rendered at the cursor inside the ring's own box, so on most slices it printed
    // the slice's name and amount over the centre readout. Recharts mounts its tooltip wrapper
    // whether or not a slice is active, so its absence is exactly what says the element is gone -
    // and this is the assertion that notices if anybody restores it.
    const { container } = render(
      <CategoryDonut currency="USD" categories={FIVE_CATEGORIES} spent={TOTAL} />,
    );

    expect(container.querySelector('.recharts-tooltip-wrapper')).toBeNull();
  });

  it('throws outside the provider rather than leaving the highlight silently dead', () => {
    // The call `useFilterNavigation` and `useAddTransaction` both make. A highlight that quietly
    // stops working reads as a slow render, so it would survive every gate and every review.
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<LegendRow categoryId="c1">Groceries</LegendRow>)).toThrow(
      /CategoryHoverProvider/,
    );

    errors.mockRestore();
  });

  it('leaves the legend rows out of the tab order', () => {
    // `display only` above already sweeps the whole card for tab stops, and now sweeps these rows
    // with it. This states the intent for the rows specifically: the highlight is a pointer-only
    // convenience saying nothing a row does not already carry in text, so making one focusable
    // would promise a keyboard contract nothing here implements.
    render(<CategoryDonut currency="USD" categories={FIVE_CATEGORIES} spent={TOTAL} />);

    for (const row of legendRows()) {
      expect(row).not.toHaveAttribute('tabindex');
      expect(row).not.toHaveAttribute('role');
    }
  });
});
