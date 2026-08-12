import { render, screen } from '@testing-library/react';

import { LogoLockup } from './LogoLockup';

// The lockup is one component across five former call sites as of PET-79, and what this suite
// pins is the part a reader gets rather than the geometry. The sizes are derived from the artwork
// and only a browser can say whether they landed - "PENDIFICO" is 4.98 times its font-size wide,
// and jsdom runs no layout, so the fit that forced `md` and `sm` to reduce the wordmark is a
// browser check by construction.

describe('LogoLockup', () => {
  it('announces one brand name and hides both visible halves', () => {
    render(<LogoLockup />);

    // The whole of what the mark says. Six other suites pin this string, which is exactly what
    // makes splitting the visible text safe rather than a regression.
    expect(screen.getByText('Spendifico')).toBeInTheDocument();

    // `getByText` reads straight through `aria-hidden`, so finding these proves nothing about the
    // accessibility tree - the attribute is what has to be asserted, because unhidden they
    // announce "dollar P E N D I F I C O".
    expect(screen.getByText('$')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('PENDIFICO')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders no heading, so the brand never precedes a screen’s own h1', () => {
    render(<LogoLockup />);

    // The call `ui/Sidebar` and this component's predecessor both recorded: the brand is not the
    // page's title, and putting it in the heading rotor would place it ahead of the real one.
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('is not a link, because picking a destination is a routing decision', () => {
    render(<LogoLockup />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each(['lg', 'md', 'sm'] as const)('renders the same accessible name at size %s', (size) => {
    const { unmount } = render(<LogoLockup size={size} />);
    expect(screen.getByText('Spendifico')).toBeInTheDocument();
    unmount();
  });

  it.each(['brand', 'onDark'] as const)('renders the same accessible name in tone %s', (tone) => {
    const { unmount } = render(<LogoLockup tone={tone} />);
    expect(screen.getByText('Spendifico')).toBeInTheDocument();
    unmount();
  });

  it('carries no U+20B5 CEDI SIGN anywhere', () => {
    // The retired glyph, pinned as an absence for the reason every rename in this repo is: the
    // mark depended on Plus Jakarta Sans resolving and had no fallback that looked right, and a
    // half-revert would put it back with every other gate green.
    const { container } = render(<LogoLockup />);
    expect(container.textContent).not.toContain('₵');
  });

  it('gives the tile a percentage radius rather than a token, and draws no ring', () => {
    // The one geometry assertion worth making without a browser, because it is a class rather
    // than a measurement: the artwork's corner arc is exactly 1/6 of the tile, so a percentage
    // tracks it at every size where `rounded-lg` tracked it at none. And an inset shadow ring
    // would paint behind an opaque tile and be invisible, which is the bug the preview page had.
    const { container } = render(<LogoLockup />);
    // The tile is the lockup's first child. Reached explicitly rather than by `div > div`, which
    // matches the lockup itself because RTL wraps the render in a container div of its own.
    const tile = container.firstElementChild?.firstElementChild;
    expect(tile).toHaveClass('rounded-[16.6667%]');
    expect(tile?.className).not.toMatch(/rounded-(lg|box|field|selector)\b/);
    expect(tile?.className).not.toMatch(/\bring\b|\bshadow-/);
  });
});
