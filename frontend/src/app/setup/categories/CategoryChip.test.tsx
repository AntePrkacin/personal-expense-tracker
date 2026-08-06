import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CATEGORY_DOT } from '@/components/ui/categoryColour';

import { CategoryChip, CHIP_STATE } from './CategoryChip';

// The repo's first toggle control, so this file is where its semantics are pinned
// rather than left to the screen test.
//
// next/jest maps every .css import to an empty object, so nothing here can assert a
// rendered colour or size; class names are the only appearance signal, and nothing
// proves they generate CSS since PET-57 retired the compile guard - review holds it.

function renderChip(selected: boolean, onToggle = jest.fn()) {
  render(<CategoryChip label="Groceries" colour="green" selected={selected} onToggle={onToggle} />);
  return { chip: screen.getByRole('button', { name: 'Groceries' }), onToggle };
}

describe('the chip state map', () => {
  it('carries a treatment for each of the two states, and two different ones', () => {
    // Guards the render assertions below: a map whose two entries were equal would
    // leave the selected chip visually identical to an unselected one while every
    // aria-pressed assertion still passed.
    //
    // Membership and count rather than a key array, which would also pin insertion
    // order and fail on a reorder that changes nothing.
    expect(Object.keys(CHIP_STATE)).toHaveLength(2);
    expect(CHIP_STATE).toHaveProperty('on');
    expect(CHIP_STATE).toHaveProperty('off');
    expect(CHIP_STATE.on).not.toBe(CHIP_STATE.off);
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

  // **"keeps the checkmark from being shorn flat by its own viewBox" was here and is deleted
  // rather than updated.** It pinned `overflow-visible` on the tick, which existed because
  // half of a 2-wide round-capped stroke fell outside a hand-traced 8.5x6 box. The tick is
  // lucide's `Check` now, drawn on a 24 grid with the padding built in, so there is no
  // clipping to guard against - and an assertion kept alive past the property it protects is
  // worse than none, because it reads as coverage.

  it('fills the dot from the shared category palette, background only', () => {
    const { container } = render(
      <CategoryChip label="Housing" colour="teal" selected={false} onToggle={jest.fn()} />,
    );

    // `CATEGORY_DOT`, not `CATEGORY_TILE`, and the negative is the half worth having: daisyUI's
    // `.status` draws its drop shadow from `currentColor` and sets `color` to a translucent
    // black for it, so a tile's `text-*-content` half turns that shadow into an opaque coloured
    // smudge under every chip. `ui/categoryColour.ts` records it, and its own suite pins that
    // the two maps agree on the background.
    const dot = container.querySelector('span[aria-hidden="true"]')!;

    expect(dot.className).toContain(CATEGORY_DOT.teal);
    expect(dot.className).not.toContain('text-accent-content');
  });

  it('hides the dot and the checkmark from assistive technology', () => {
    // Neither carries information: aria-pressed already reports the state, and the dot cannot
    // even identify the category to a reader who can see it - two of the ten chips share a
    // colour word, and `ui/categoryColour.ts` maps orange and yellow both onto `warning` on top
    // of that, so five of the ten are in a rendered tie.
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
    ['unselected', false, 'off'],
    ['selected', true, 'on'],
  ] as const)('applies the %s treatment', (_label, selected, state) => {
    // The state's own treatment and not the other one's, which is what catches the
    // two being swapped - a mistake nothing else here could see, since aria-pressed
    // would still report correctly. The classes themselves are daisyUI's `btn`
    // modifiers rather than hand-picked colours, so this pins the mapping only.
    const { chip } = renderChip(selected);
    const other = state === 'on' ? 'off' : 'on';

    expect(chip.className).toContain(CHIP_STATE[state]);
    expect(chip.className).not.toContain(CHIP_STATE[other]);
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
