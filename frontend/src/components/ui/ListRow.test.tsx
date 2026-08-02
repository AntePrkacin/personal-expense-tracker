import { render, screen } from '@testing-library/react';

import { CATEGORY_TILE, type CategoryColour } from './categoryColour';
import { ListRow } from './ListRow';

// jsdom has no stylesheet under next/jest, so these assert class names. That
// includes `truncate` and `min-w-0`: the classes are asserted, not the visual
// ellipsis, which cannot happen without layout.

// U+2212 MINUS SIGN, not U+002D HYPHEN-MINUS. Retyping this as a plain hyphen
// makes the assertion fail with a diff that is almost impossible to read.
const MINUS = '−';

const COLOURS = Object.keys(CATEGORY_TILE) as CategoryColour[];

function renderRow(props: Partial<React.ComponentProps<typeof ListRow>> = {}) {
  return render(
    <ListRow title="Whole Foods" subtitle="Groceries · Today" amount={24} {...props} />,
  );
}

describe('ListRow', () => {
  it('renders the merchant, the caption and the amount', () => {
    renderRow();

    expect(screen.getByText('Whole Foods')).toHaveClass('text-strong-m', 'text-text-primary');
    expect(screen.getByText('Groceries · Today')).toHaveClass('text-body-s', 'text-text-tertiary');
    expect(screen.getByText(`${MINUS}$24.00`)).toBeInTheDocument();
  });

  it('renders a stored positive amount as a negative one', () => {
    // Amounts are persisted as magnitudes; showing them negative is this
    // component's job rather than every calling screen's.
    renderRow({ amount: 18.5 });

    expect(screen.getByText(`${MINUS}$18.50`)).toBeInTheDocument();
  });

  it('right-aligns the amount without colouring it as an error', () => {
    // Every row on the list is a debit, so a red amount would mark the normal
    // case as a problem. The design keeps it in the primary text colour.
    renderRow();

    const amount = screen.getByText(`${MINUS}$24.00`);
    expect(amount).toHaveClass('text-right', 'shrink-0');
    expect(amount).not.toHaveClass('text-status-danger');
  });

  it('covers all eight category colours', () => {
    // Vacuity guard for the it.each below.
    expect(COLOURS).toHaveLength(8);
  });

  it.each(COLOURS)('tints the icon tile for the %s category', (colour) => {
    const { container } = renderRow({ categoryColour: colour });

    const tile = container.firstElementChild!.firstElementChild!;
    expect(tile).toHaveClass(CATEGORY_TILE[colour]);
  });

  it('defaults to the coral tile the Figma component ships with', () => {
    const { container } = renderRow();

    expect(container.firstElementChild!.firstElementChild).toHaveClass(CATEGORY_TILE.coral);
  });

  it('hides the tile from assistive technology', () => {
    // Its colour and glyph repeat what the subtitle already says in words.
    const { container } = renderRow();

    expect(container.firstElementChild!.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('lets the placeholder glyph bleed outside its own box', () => {
    // Regression guard, and it looks removable when it is not.
    //
    // The handle's 1.6-wide stroke runs along x=0 and peaks at y=0, so half of
    // it falls outside the 20x20 viewBox. An SVG viewport clips its own
    // overflow by default, which shears the top-left of the arc flat. Figma
    // does not clip it: measured against the Figma tile, the arc starts at 9px
    // inside a 40px tile whose icon box only begins at 10px. Dropping this
    // class changes nothing that any other test can see.
    const { container } = renderRow();

    const glyph = container.firstElementChild!.firstElementChild!.firstElementChild!;
    expect(glyph.tagName.toLowerCase()).toBe('svg');
    expect(glyph).toHaveClass('overflow-visible');
  });

  it('lets a caller replace the placeholder glyph', () => {
    // Figma uses one glyph for every category, so real per-category icons will
    // arrive later through this seam rather than through a rewrite.
    renderRow({ icon: <span>cart</span> });

    expect(screen.getByText('cart')).toBeInTheDocument();
  });

  it('lets a long merchant name ellipse instead of pushing the amount away', () => {
    renderRow({ title: 'A very long merchant name that will not fit on one line' });

    const text = screen.getByText(/A very long merchant name/);
    expect(text).toHaveClass('truncate');
    expect(text.parentElement).toHaveClass('min-w-0');
  });
});
