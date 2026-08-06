import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { DateField } from './DateField';

// October 2025 is the month the whole Figma file is drawn in, and the 8th is the day frame 09
// shows, so the clock is pinned there: every assertion below can then name the designed string
// literally rather than recomputing it, which would pass against a broken derivation.
//
// Fake timers with userEvent need `advanceTimers`, or every `await user.click` hangs waiting on
// a timer that nothing advances.
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8, 12, 0));
});

afterEach(() => {
  jest.useRealTimers();
});

const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

/** Controlled, because the real consumer is: the modal owns the value. */
function Harness({ initial = '', error }: { initial?: string; error?: string }) {
  const [value, setValue] = useState(initial);

  return (
    <>
      <DateField id="date" label="Date" value={value} onChange={setValue} error={error} />
      {/* A second tab stop after the field, so the roving-tabIndex assertion has somewhere
          to land other than the grid. */}
      <button type="button">After</button>
    </>
  );
}

const trigger = () => screen.getByRole('button', { name: /Date/ });
const popover = () => screen.getByRole('dialog', { name: 'Choose a date' });
const day = (label: string) => screen.getByRole('button', { name: label });

describe('the resting trigger', () => {
  it('shows the designed value and is labelled by the field label', async () => {
    render(<Harness initial="2025-10-08" />);

    // Node 28:402's own string, and the accessible name is label plus value - which is what
    // aria-labelledby naming both the shell's label and a span inside the button buys, since a
    // <label for> alone would not name a button at all.
    expect(trigger()).toHaveAccessibleName('Date Oct 8, 2025');
    expect(trigger()).toHaveTextContent('Oct 8, 2025');
  });

  it('shows a placeholder when it holds no date', () => {
    render(<Harness />);

    expect(trigger()).toHaveTextContent('Select a date');
  });

  it('announces itself as opening a dialog, and closed to begin with', () => {
    render(<Harness initial="2025-10-08" />);

    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is not a combobox, because it is not a select', () => {
    // The field looks like ui/Select and deliberately is not one: a native select cannot host
    // a popover. Pinned so nobody "fixes" the markup back into a <select>.
    render(<Harness initial="2025-10-08" />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('carries the error wiring ui/FieldShell provides', () => {
    render(<Harness initial="2025-10-08" error="Choose a date." />);

    expect(trigger()).toHaveAccessibleDescription('Choose a date.');
    expect(screen.getByText('Choose a date.')).toBeInTheDocument();
    // `select-error` is the visible half of a state this control cannot express in aria at all
    // (see the next test), which is why it is pinned beside the description rather than left to
    // review like every other class in this file.
    expect(trigger()).toHaveClass('select-error');
  });

  it('does not set aria-invalid, which the button role does not support', () => {
    // ui/Input and ui/Select both set it, on real form controls where the textbox and combobox
    // roles support it. A button does not, so the invalid state is carried by `select-error`'s
    // border and by the description above. Pinned so it is not "restored" for consistency with
    // the two fields beside it.
    render(<Harness initial="2025-10-08" error="Choose a date." />);

    expect(trigger()).not.toHaveAttribute('aria-invalid');
  });
});

describe('opening and closing', () => {
  it('opens the calendar on the selected month', async () => {
    render(<Harness initial="2025-10-08" />);

    await user().click(trigger());

    expect(popover()).toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('October 2025')).toBeInTheDocument();
  });

  it('opens on the current month when it holds no date', async () => {
    render(<Harness />);

    await user().click(trigger());

    expect(screen.getByText('October 2025')).toBeInTheDocument();
  });

  it('focuses the selected day on open', async () => {
    render(<Harness initial="2025-10-08" />);

    await user().click(trigger());

    expect(day('Oct 8, 2025')).toHaveFocus();
  });

  it('closes on a second click of the trigger', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();

    await u.click(trigger());
    await u.click(trigger());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns focus to the trigger when it closes', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();

    await u.click(trigger());
    await u.click(day('Oct 9, 2025'));

    expect(trigger()).toHaveFocus();
  });
});

describe('picking a day', () => {
  it('reports the ISO date and closes', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();

    await u.click(trigger());
    await u.click(day('Oct 9, 2025'));

    expect(trigger()).toHaveTextContent('Oct 9, 2025');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('marks the selected day and only that day', async () => {
    render(<Harness initial="2025-10-08" />);

    await user().click(trigger());

    // On the gridcell rather than the button: the `button` role does not support
    // aria-selected, and the ARIA grid pattern puts selection on the cell.
    expect(day('Oct 8, 2025').closest('[role="gridcell"]')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(day('Oct 9, 2025').closest('[role="gridcell"]')).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('announces today as the current date', async () => {
    // aria-current is what carries the `today` colour to a screen reader, and it is valid on a
    // button where aria-selected is not.
    render(<Harness initial="2025-10-20" />);

    await user().click(trigger());

    expect(day('Oct 8, 2025')).toHaveAttribute('aria-current', 'date');
    expect(day('Oct 20, 2025')).not.toHaveAttribute('aria-current');
  });

  it('gives every day its full date as an accessible name', async () => {
    // "8" alone tells a screen-reader user nothing about which month they are in.
    render(<Harness initial="2025-10-08" />);

    await user().click(trigger());

    expect(day('Oct 1, 2025')).toBeInTheDocument();
    expect(day('Oct 31, 2025')).toBeInTheDocument();
  });

  it('renders the month it is showing and nothing from its neighbours', async () => {
    render(<Harness initial="2025-10-08" />);

    await user().click(trigger());

    // 31 days, and no 30 September or 1 November leaking into the padding cells.
    expect(screen.getAllByRole('gridcell').filter((c) => c.textContent !== '')).toHaveLength(31);
    expect(screen.queryByRole('button', { name: 'Sep 30, 2025' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nov 1, 2025' })).not.toBeInTheDocument();
  });
});

describe('paging with the chevrons', () => {
  it('steps back and forward a month', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();
    await u.click(trigger());

    await u.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('September 2025')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('October 2025')).toBeInTheDocument();
  });

  it('crosses a year boundary, which is how the year is changed at all', async () => {
    // There is no separate year control: paging December forward reaches January 2026, which
    // is what makes the two chevrons sufficient.
    render(<Harness initial="2025-12-15" />);
    const u = user();
    await u.click(trigger());

    await u.click(screen.getByRole('button', { name: 'Next month' }));

    expect(screen.getByText('January 2026')).toBeInTheDocument();
  });

  // The reason the focus flag exists. If paging moved focus into the grid, the second click
  // would land on a day button instead of the chevron and paging twice would be impossible.
  it('keeps focus on the chevron, so it can be clicked repeatedly', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();
    await u.click(trigger());

    const previous = screen.getByRole('button', { name: 'Previous month' });
    await u.click(previous);

    expect(previous).toHaveFocus();

    await u.click(previous);
    expect(screen.getByText('August 2025')).toBeInTheDocument();
  });

  it('does not change the selected value', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();
    await u.click(trigger());

    await u.click(screen.getByRole('button', { name: 'Previous month' }));
    await u.click(screen.getByRole('button', { name: 'Next month' }));
    await u.click(trigger());

    expect(trigger()).toHaveTextContent('Oct 8, 2025');
  });
});

describe('the keyboard', () => {
  it('moves a day with the left and right arrows', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();
    await u.click(trigger());

    await u.keyboard('{ArrowRight}');
    expect(day('Oct 9, 2025')).toHaveFocus();

    await u.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(day('Oct 7, 2025')).toHaveFocus();
  });

  it('moves a week with the up and down arrows', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();
    await u.click(trigger());

    await u.keyboard('{ArrowDown}');
    expect(day('Oct 15, 2025')).toHaveFocus();

    await u.keyboard('{ArrowUp}{ArrowUp}');
    expect(day('Oct 1, 2025')).toHaveFocus();
  });

  it('follows the view into the previous month when arrowing off the start', async () => {
    render(<Harness initial="2025-10-01" />);
    const u = user();
    await u.click(trigger());

    await u.keyboard('{ArrowLeft}');

    expect(screen.getByText('September 2025')).toBeInTheDocument();
    expect(day('Sep 30, 2025')).toHaveFocus();
  });

  it('pages a month with PageUp and PageDown', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();
    await u.click(trigger());

    await u.keyboard('{PageUp}');
    expect(screen.getByText('September 2025')).toBeInTheDocument();
    expect(day('Sep 8, 2025')).toHaveFocus();

    await u.keyboard('{PageDown}');
    expect(day('Oct 8, 2025')).toHaveFocus();
  });

  it('clamps the day when paging into a shorter month rather than rolling over', async () => {
    // From 31 January, PageDown means the last day of February - not 3 March, which plain
    // month arithmetic on a Date would give.
    render(<Harness initial="2025-01-31" />);
    const u = user();
    await u.click(trigger());

    await u.keyboard('{PageDown}');

    expect(screen.getByText('February 2025')).toBeInTheDocument();
    expect(day('Feb 28, 2025')).toHaveFocus();
  });

  it('selects the focused day with Enter', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();
    await u.click(trigger());

    await u.keyboard('{ArrowRight}{Enter}');

    expect(trigger()).toHaveTextContent('Oct 9, 2025');
  });

  it('keeps exactly one day in the tab order', async () => {
    // The roving tabIndex. Without it, tabbing out of the grid would take up to 42 presses.
    render(<Harness initial="2025-10-08" />);
    await user().click(trigger());

    const tabbable = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('data-iso') !== null && b.tabIndex === 0);

    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAccessibleName('Oct 8, 2025');
  });
});

describe('Escape', () => {
  // The one place in this feature where Escape needs code. A <dialog> treats Escape as a close
  // request, so without preventDefault the browser would close the whole modal and discard
  // everything typed - and (app)/Modal.tsx deliberately writes no keydown handler at all.
  it('closes the popover and leaves the value alone', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();
    await u.click(trigger());

    await u.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent('Oct 8, 2025');
    expect(trigger()).toHaveFocus();
  });

  it('prevents the default, so the surrounding dialog does not treat it as a close request', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();
    await u.click(trigger());

    // Dispatched by hand because the assertion is about defaultPrevented, which user-event
    // does not surface. This is the guard on the modal staying open behind the popover.
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    popover().dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe('the grid’s ARIA structure', () => {
  it('keeps the weekday initials outside the grid, so no row owns nothing', async () => {
    // A `role="row"` must own gridcell/cell/columnheader/rowheader children. The initials are all
    // aria-hidden by design - S and T each appear twice, so announcing them is worse than silence
    // - which made a row containing them a row that owns nothing: a screen reader is entitled to
    // announce an empty row or to miscount the grid's columns. `jsx-a11y` does not check ARIA
    // ownership, so nothing failed until it was read.
    render(<Harness initial="2025-10-08" />);

    await user().click(trigger());

    const grid = screen.getByRole('grid');
    // Every row inside the grid owns at least one cell.
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.querySelectorAll('[role="gridcell"]').length).toBeGreaterThan(0);
    }
    // And the initials are not among the grid's descendants at all.
    expect(grid.textContent).not.toContain('S');
  });

  it('still renders the initials, just not as grid structure', async () => {
    render(<Harness initial="2025-10-08" />);

    await user().click(trigger());

    const strip = popover().querySelector('[aria-hidden="true"].flex');
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toBe('MTWTFSS');
  });
});

describe('the popover escapes the modal rather than scrolling it', () => {
  it('is positioned fixed, so the dialog’s overflow cannot clip or count it', async () => {
    // Measured in Chrome before this was written: a `<dialog>` gets `overflow: auto` and a
    // max-height from the user agent, so an `absolute` popover grew the modal's scrollHeight
    // from 532 to 663 and 131px of the calendar was clipped behind a scrollbar. `fixed` escapes
    // both, because the dialog sets no transform and so establishes no containing block.
    render(<Harness initial="2025-10-08" />);

    await user().click(trigger());

    expect(popover()).toHaveClass('fixed');
    expect(popover().className).not.toContain('absolute');
  });

  it('anchors itself to the trigger with inline coordinates', async () => {
    // `fixed` needs viewport coordinates, which Tailwind cannot express. jsdom reports every rect
    // as zero, so what is assertable is that both are set rather than what they are; the visual
    // placement is a browser check.
    render(<Harness initial="2025-10-08" />);

    await user().click(trigger());

    expect(popover().style.top).not.toBe('');
    expect(popover().style.left).not.toBe('');
  });
});

describe('dismissing by clicking elsewhere', () => {
  it('closes when something else in the form is clicked', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();
    await u.click(trigger());

    await u.click(screen.getByRole('button', { name: 'After' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lets that click land where it was aimed', async () => {
    // Dismissal is on `mousedown`, so the popover is gone before the thing under the pointer
    // reacts - one gesture rather than two. And it deliberately does not pull focus back to the
    // trigger, which would fight whatever the user just clicked into.
    render(<Harness initial="2025-10-08" />);
    const u = user();
    await u.click(trigger());

    const after = screen.getByRole('button', { name: 'After' });
    await u.click(after);

    expect(after).toHaveFocus();
    expect(trigger()).not.toHaveFocus();
  });

  it('stays open when the calendar itself is clicked', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();
    await u.click(trigger());

    await u.click(screen.getByRole('button', { name: 'Previous month' }));

    expect(popover()).toBeInTheDocument();
  });

  // The trigger is excluded from the outside-click handler on purpose: its own onClick toggles,
  // so dismissing on mousedown would let the click immediately reopen it and the button would
  // appear dead.
  it('still closes on a second click of the trigger rather than reopening', async () => {
    render(<Harness initial="2025-10-08" />);
    const u = user();

    await u.click(trigger());
    await u.click(trigger());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on a resize, because its coordinates were computed once', async () => {
    render(<Harness initial="2025-10-08" />);
    await user().click(trigger());

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('today', () => {
  it('marks today distinctly when it is not the selected day', async () => {
    render(<Harness initial="2025-10-20" />);

    await user().click(trigger());

    // The 8th is today under the pinned clock, the 20th is selected, and the two states are
    // mutually exclusive in the markup with selected winning. The two daisyUI classes are each
    // the visible half of an aria state this test pins beside them, which is the one case
    // `frontend/CLAUDE.md` allows a class assertion for.
    expect(day('Oct 8, 2025')).toHaveAttribute('aria-current', 'date');
    expect(day('Oct 8, 2025')).toHaveClass('btn-outline');

    expect(day('Oct 20, 2025').closest('[role="gridcell"]')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(day('Oct 20, 2025')).toHaveClass('btn-primary');
    expect(day('Oct 20, 2025')).not.toHaveAttribute('aria-current');
  });
});
