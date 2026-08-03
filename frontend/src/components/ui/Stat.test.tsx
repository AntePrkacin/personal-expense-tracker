import { render, screen } from '@testing-library/react';

import { Stat } from './Stat';

// jsdom has no stylesheet under next/jest, so these assert class names rather
// than rendered type sizes.

// U+2014 EM DASH, written as an escape for the same reason the component does:
// pasted, it is indistinguishable from an en dash or a hyphen.
const EM_DASH = '—';

describe('Stat', () => {
  it('renders a value and its label in the designed styles', () => {
    render(<Stat value="$1,240" label="Spent this month" />);

    expect(screen.getByText('$1,240')).toHaveClass('text-display-s', 'text-text-primary');
    expect(screen.getByText('Spent this month')).toHaveClass('text-label-s', 'text-text-tertiary');
  });

  it('accepts a number as well as a string', () => {
    render(<Stat value={38} label="Transactions" />);

    expect(screen.getByText('38')).toBeInTheDocument();
  });

  it.each([[undefined], [null], ['']])('renders the dash placeholder for %p', (value) => {
    render(<Stat value={value} label="Top category" />);

    expect(screen.getByText(EM_DASH)).toBeInTheDocument();
    expect(screen.getByText('Top category')).toBeInTheDocument();
  });

  // The most likely bug in this component. "instead of a zero" means "do not
  // substitute a zero for a missing value", NOT "treat zero as missing":
  // 05 Dashboard - Empty renders "0 Transactions" and "$0 Avg / day" as real
  // figures on the very same row as the dash. A `!value` check would blank both.
  it.each([
    [0, '0'],
    ['$0', '$0'],
  ])('treats %p as a real value, not a missing one', (value, expected) => {
    render(<Stat value={value} label="Avg / day" />);

    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(EM_DASH)).not.toBeInTheDocument();
  });

  it('describes the missing value in words rather than leaving a bare dash', () => {
    // A lone em dash is announced inconsistently across screen readers, so the
    // glyph is hidden and the meaning is spelled out.
    //
    // Note that getByText finds aria-hidden nodes - only the *ByRole queries
    // respect it - so finding the dash proves nothing about exposure. Assert
    // the attribute directly.
    render(<Stat label="Top category" />);

    expect(screen.getByText(EM_DASH)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('No value')).toHaveClass('sr-only');
  });
});
