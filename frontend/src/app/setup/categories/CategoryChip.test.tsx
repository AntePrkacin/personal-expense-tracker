import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CATEGORY_TILE } from '@/components/ui/categoryColour';

import { CategoryChip, CHIP_LABEL, CHIP_SURFACE } from './CategoryChip';

// The repo's first toggle control, so this file is where its semantics are pinned
// rather than left to the screen test.
//
// next/jest maps every .css import to an empty object, so nothing here can assert a
// rendered colour or size; class names are the only appearance signal, and that they
// generate CSS is proved in components/ui/utilities.test.ts.

function renderChip(selected: boolean, onToggle = jest.fn()) {
  render(<CategoryChip label="Groceries" colour="green" selected={selected} onToggle={onToggle} />);
  return { chip: screen.getByRole('button', { name: 'Groceries' }), onToggle };
}

describe('the chip state maps', () => {
  it('carries a fill and a label colour for each of the two states', () => {
    // Guards the it.each blocks below, and the split itself: fill and label are
    // separate maps because border-border-strong and border-brand-accent have equal
    // specificity, so a single string emitting both would let stylesheet order pick.
    //
    // Membership and count rather than a key array, which would also pin insertion
    // order and fail on a reorder that changes nothing.
    for (const map of [CHIP_SURFACE, CHIP_LABEL]) {
      expect(Object.keys(map)).toHaveLength(2);
      expect(map).toHaveProperty('on');
      expect(map).toHaveProperty('off');
    }
  });

  it('tints the selected chip and types it in the pressed accent', () => {
    // The design's selected treatment, asserted as values so a token swap is a
    // failure here rather than a silently different screen.
    expect(CHIP_SURFACE.on).toContain('bg-brand-accent-soft');
    expect(CHIP_SURFACE.on).toContain('border-brand-accent');
    expect(CHIP_LABEL.on).toBe('text-brand-accent-pressed');
    expect(CHIP_SURFACE.off).toContain('border-border-strong');
  });
});

describe('CategoryChip', () => {
  it('is a button rather than a link or a checkbox', () => {
    // The semantics decision, pinned. A link cannot be pressed and would navigate;
    // a checkbox was the considered alternative and is recorded in the component.
    const { chip } = renderChip(false);

    expect(chip).toHaveAttribute('type', 'button');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it.each([true, false])('reports its pressed state as %s', (selected) => {
    // aria-pressed is the whole reason the checkmark can be aria-hidden: without
    // it, the selected state would be carried by two decorative shapes and a border,
    // none of which a screen reader announces.
    const { chip } = renderChip(selected);

    expect(chip).toHaveAttribute('aria-pressed', String(selected));
  });

  it('shows the checkmark only when selected', () => {
    const { container } = render(
      <CategoryChip label="Groceries" colour="green" selected={false} onToggle={jest.fn()} />,
    );
    expect(container.querySelector('svg')).toBeNull();

    const withCheck = render(
      <CategoryChip label="Bills" colour="orange" selected onToggle={jest.fn()} />,
    );
    expect(withCheck.container.querySelector('svg')).not.toBeNull();
  });

  it('strokes the checkmark in the accent, not the label colour', () => {
    // Figma strokes the tick with Brand/Accent while the label beside it is Brand
    // Accent Pressed, so `currentColor` would quietly darken it. The two sit
    // millimetres apart and are indistinguishable in a diff.
    const { container } = render(
      <CategoryChip label="Bills" colour="orange" selected onToggle={jest.fn()} />,
    );

    expect(container.querySelector('svg')!.getAttribute('class')).toContain('text-brand-accent');
  });

  it('keeps the checkmark from being shorn flat by its own viewBox', () => {
    // Half of the 2-wide round-capped stroke falls outside the box at every end, so
    // without overflow-visible both tips and the elbow render clipped. Same trap
    // ui/Select's and ui/ListRow's glyphs document.
    const { container } = render(
      <CategoryChip label="Bills" colour="orange" selected onToggle={jest.fn()} />,
    );

    expect(container.querySelector('svg')!.getAttribute('class')).toContain('overflow-visible');
  });

  it('fills the dot from the shared category palette', () => {
    const { container } = render(
      <CategoryChip label="Housing" colour="teal" selected={false} onToggle={jest.fn()} />,
    );

    const dot = container.querySelector('span[aria-hidden="true"]')!;
    expect(dot.className).toContain(CATEGORY_TILE.teal);
  });

  it('hides the dot and the checkmark from assistive technology', () => {
    // Neither carries information: aria-pressed already reports the state, and two
    // of the ten chips share a colour with another, so the dot cannot even identify
    // the category to a reader who can see it.
    const { container } = render(
      <CategoryChip label="Bills" colour="orange" selected onToggle={jest.fn()} />,
    );

    expect(container.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // The name has to survive both being hidden, or the chip announces as a blank
    // button.
    expect(screen.getByRole('button', { name: 'Bills' })).toBeInTheDocument();
  });

  it.each([
    ['unselected', false],
    ['selected', true],
  ])('applies the %s treatment', (_label, selected) => {
    const { chip } = renderChip(selected);
    const state = selected ? 'on' : 'off';

    expect(chip).toHaveClass(...CHIP_SURFACE[state].split(' '));
    expect(chip).toHaveClass(...CHIP_LABEL[state].split(' '));
    // The width that does not change with the state, which is the deviation from
    // the frame: a border that thickened on selection would rewrap the row.
    expect(chip).toHaveClass('border-[1.5px]');
    // A <button> gets an arrow from the user agent, and a chip does not look like a
    // button, so the pointer is what says these pills are the thing to tap (CAT-1).
    expect(chip).toHaveClass('cursor-pointer');
  });

  it('toggles on a click', async () => {
    const user = userEvent.setup();
    const { chip, onToggle } = renderChip(false);

    await user.click(chip);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it.each(['{ }', '{Enter}'])('toggles on %s from the keyboard', async (key) => {
    // Both, because this is the reason it is a button rather than a checkbox: a
    // checkbox answers Space alone. The chips are the only way through this screen
    // for a keyboard user, so it is worth asserting rather than assuming.
    const user = userEvent.setup();
    const { chip, onToggle } = renderChip(false);

    chip.focus();
    await user.keyboard(key);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('takes one tab stop, and is not removed from the order', async () => {
    const user = userEvent.setup();
    const { chip } = renderChip(false);

    await user.tab();

    expect(chip).toHaveFocus();
  });
});
