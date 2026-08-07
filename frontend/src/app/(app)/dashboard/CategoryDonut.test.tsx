import { render, screen, within } from '@testing-library/react';

import { CategoryDonut } from './CategoryDonut';

// Node 21:4's own five categories (DSH-8), whose percentages are the ones that naively round
// to 99 - so the apportionment is exercised by the default fixture rather than only by a
// contrived one.
const FIVE_CATEGORIES = [
  { id: 'c1', name: 'Groceries', color: '#57B368', spent: 397, percent: 32.4 },
  { id: 'c2', name: 'Dining out', color: '#EF6F6C', spent: 298, percent: 24.3 },
  { id: 'c3', name: 'Transport', color: '#3F8EE6', spent: 223, percent: 18.2 },
  { id: 'c4', name: 'Shopping', color: '#CE6FB8', spent: 174, percent: 14.2 },
  { id: 'c5', name: 'Other', color: '#E7C24A', spent: 148, percent: 10.9 },
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
    const { container } = render(<CategoryDonut categories={FIVE_CATEGORIES} spent={TOTAL} />);

    expect(container.querySelectorAll('.recharts-pie-sector')).toHaveLength(5);
  });

  it('gives every slice its category colour as a CSS variable, never a class', () => {
    // A Tailwind class in an SVG `fill` resolves to nothing at all: the slice simply never
    // paints, with no error anywhere. That is the failure `CATEGORY_FILL` exists to prevent.
    const { container } = render(<CategoryDonut categories={FIVE_CATEGORIES} spent={TOTAL} />);
    const fills = Array.from(container.querySelectorAll('.recharts-pie-sector path')).map((s) =>
      s.getAttribute('fill'),
    );

    expect(fills).toEqual([
      'var(--color-success)', // Groceries, green
      'var(--color-error)', // Dining out, coral
      'var(--color-info)', // Transport, blue
      'var(--color-secondary)', // Shopping, pink
      'var(--color-warning)', // Other, yellow
    ]);
  });

  it('falls back to grey for a colour outside the eight rather than dropping the slice', () => {
    // Dropping it would make the ring not close, which is the one thing this card must not do.
    const { container } = render(
      <CategoryDonut
        categories={[
          { id: 'c1', name: 'Groceries', color: '#57B368', spent: 60, percent: 60 },
          { id: 'c2', name: 'Uncategorized', color: '#98A0AE', spent: 40, percent: 40 },
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
        categories={[
          { id: 'c1', name: 'Uncategorized', color: '#98A0AE', spent: 40, percent: 100 },
        ]}
        spent={40}
      />,
    );

    const fill = container.querySelector('.recharts-pie-sector path')?.getAttribute('fill') ?? '';
    expect(fill).not.toContain('base-300');
    expect(fill).not.toContain('base-100');
  });

  it('separates the arcs with a seam, so two same-coloured slices cannot merge', () => {
    // `orange` and `yellow` both resolve to `var(--color-warning)` by design, so adjacent slices
    // can share a fill. Without a stroke the ring would show one arc where the legend lists two.
    const { container } = render(
      <CategoryDonut
        categories={[
          { id: 'c1', name: 'A', color: '#F29A3D', spent: 60, percent: 60 },
          { id: 'c2', name: 'B', color: '#E7C24A', spent: 40, percent: 40 },
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
    render(<CategoryDonut categories={FIVE_CATEGORIES} spent={TOTAL} />);
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
    render(<CategoryDonut categories={[...FIVE_CATEGORIES].reverse()} spent={TOTAL} />);

    expect(legendRows()[0]?.textContent).toContain('Groceries');
  });

  // The requirement, stated directly.
  it('shows percentages that sum to exactly 100', () => {
    render(<CategoryDonut categories={FIVE_CATEGORIES} spent={TOTAL} />);

    expect(percentsFromLegend().reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('sums to 100 for a set that would naively round to 101 too', () => {
    render(
      <CategoryDonut
        categories={[
          { id: 'a', name: 'A', color: '#57B368', spent: 306, percent: 30.6 },
          { id: 'b', name: 'B', color: '#EF6F6C', spent: 306, percent: 30.6 },
          { id: 'c', name: 'C', color: '#3F8EE6', spent: 196, percent: 19.6 },
          { id: 'd', name: 'D', color: '#CE6FB8', spent: 192, percent: 19.2 },
        ]}
        spent={1000}
      />,
    );

    expect(percentsFromLegend().reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('gives a single category the whole circle', () => {
    render(
      <CategoryDonut
        categories={[{ id: 'c1', name: 'Groceries', color: '#57B368', spent: 40, percent: 100 }]}
        spent={40}
      />,
    );

    expect(percentsFromLegend()).toEqual([100]);
  });
});

describe('the centre readout (AC2)', () => {
  it('shows the period total over its caption', () => {
    render(<CategoryDonut categories={FIVE_CATEGORIES} spent={TOTAL} />);

    expect(screen.getByText('$1,240')).toBeInTheDocument();
    expect(screen.getByText('Total spent')).toBeInTheDocument();
  });

  // "Cannot disagree" is a property of the current wiring rather than a law: both cards read the
  // same field off the same response through the same formatter. If a later ticket ever gives
  // this card its own read, this is the assertion that notices.
  it('formats it exactly as BudgetCard formats the same field', () => {
    render(<CategoryDonut categories={FIVE_CATEGORIES} spent={1240.5} />);

    expect(screen.getByText('$1,241')).toBeInTheDocument();
  });

  it('leaves the total outside the hidden subtree, since nothing else on the card states it', () => {
    // The legend is a superset of the *tooltip*, which is what makes hiding the ring acceptable -
    // but it is not a superset of this. No legend row carries the period total, so hiding this
    // pair with the ring would leave AC2's figure on no accessible surface at all.
    //
    // RTL queries read through `aria-hidden`, so both assertions above pass with this defect
    // present. Only the containment says which.
    render(<CategoryDonut categories={FIVE_CATEGORIES} spent={TOTAL} />);

    expect(screen.getByText('$1,240').closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByText('Total spent').closest('[aria-hidden="true"]')).toBeNull();
  });
});

describe('display only', () => {
  it('has no interactive role and nothing in the tab order', () => {
    const { container } = render(<CategoryDonut categories={FIVE_CATEGORIES} spent={TOTAL} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[tabindex]:not([tabindex="-1"])')).toHaveLength(0);
    expect(container.querySelectorAll('[role="application"]')).toHaveLength(0);
  });

  it('hides the ring from assistive technology, since the legend already carries every fact', () => {
    const { container } = render(<CategoryDonut categories={FIVE_CATEGORIES} spent={TOTAL} />);

    const chart = container.querySelector('.recharts-responsive-container');
    expect(chart?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('leaves the legend outside that hidden subtree', () => {
    // The whole reason hiding the ring is acceptable. If the legend went with it the card would
    // announce nothing at all.
    render(<CategoryDonut categories={FIVE_CATEGORIES} spent={TOTAL} />);

    for (const row of legendRows()) {
      expect(row.closest('[aria-hidden="true"]')).toBeNull();
    }
  });
});

describe('the whole period empty, which PET-26 replaces', () => {
  it('renders nothing rather than an empty ring', () => {
    const { container } = render(<CategoryDonut categories={[]} spent={0} />);

    expect(container).toBeEmptyDOMElement();
  });
});
