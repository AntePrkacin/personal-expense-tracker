import { render, screen } from '@testing-library/react';

import { ProgressBar } from './ProgressBar';

// jsdom has no stylesheet (next/jest stubs .css), so these assert class names
// and inline styles rather than computed appearance. The inline width is real
// CSS though, because it is set as a style attribute rather than a utility.

describe('ProgressBar', () => {
  it('is reachable by its accessible name', () => {
    // Querying *by name* is the axe rule "progressbar must have an accessible
    // name" made executable: a nameless bar fails this, not just review.
    render(<ProgressBar value={1240} max={2000} label="Monthly budget" />);

    expect(screen.getByRole('progressbar', { name: 'Monthly budget' })).toBeInTheDocument();
  });

  it('takes its name from another element when given one', () => {
    render(
      <>
        <h2 id="groceries">Groceries this month</h2>
        <ProgressBar value={397} max={500} labelledBy="groceries" />
      </>,
    );

    expect(screen.getByRole('progressbar', { name: 'Groceries this month' })).toBeInTheDocument();
  });

  it('reports its real figures to assistive technology', () => {
    render(<ProgressBar value={1240} max={2000} label="Monthly budget" />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '1240');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '2000');
  });

  it('announces a spoken value when one is supplied', () => {
    render(
      <ProgressBar value={1240} max={2000} label="Monthly budget" valueText="$1,240 of $2,000" />,
    );

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '$1,240 of $2,000');
  });

  // The boundary is the whole point of this component, and at-cap is the
  // classic off-by-one. It is also a real screen: Housing at $1,100 of $1,100
  // is tagged "Full", not "Over" (13 Categories, node 37:567).
  it.each([
    ['under the cap', 397, 500, 'bg-brand-accent'],
    ['exactly at the cap', 1100, 1100, 'bg-brand-accent'],
    ['over the cap', 312, 300, 'bg-status-danger'],
  ])('uses the right fill when %s', (_case, value, max, expected) => {
    const { container } = render(<ProgressBar value={value} max={max} label="Budget" />);

    expect(container.querySelector('[role="progressbar"]')!.firstElementChild).toHaveClass(
      expected,
    );
  });

  it('clamps the drawn width without clamping the announced value', () => {
    // A user at 104% of their budget should be told 312 against a cap of 300.
    // Only the bar geometry is capped, because a bar cannot draw past its track.
    render(<ProgressBar value={312} max={300} label="Dining out" />);

    const bar = screen.getByRole('progressbar');
    expect(bar.firstElementChild).toHaveStyle({ width: '100%' });
    expect(bar).toHaveAttribute('aria-valuenow', '312');
  });

  it('draws an empty bar at zero', () => {
    render(<ProgressBar value={0} max={2000} label="Monthly budget" />);

    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '0%' });
  });

  it('survives a category with no cap', () => {
    // max === 0 divides to NaN, and "width: NaN%" is invalid CSS that renders
    // as a full or empty bar depending on the browser. No variant is designed
    // for an uncapped category, so this input is reachable.
    render(<ProgressBar value={88} max={0} label="Uncapped" />);

    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '0%' });
  });

  it('rounds the width to a stable string', () => {
    // 397/500 is exact, but plenty of real ratios are not; without toFixed the
    // style attribute reads "61.99999999999999%".
    render(<ProgressBar value={1} max={3} label="Thirds" />);

    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '33.33%' });
  });
});
