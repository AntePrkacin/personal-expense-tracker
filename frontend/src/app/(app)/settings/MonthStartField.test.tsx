import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MonthStartField, monthStartLabel } from './MonthStartField';

// The "Month starts on" picker.
//
// **jsdom implements none of the Popover API**, and `jest.setup.ts` deliberately polyfills none of
// it - the call `TransactionRowMenu` and `ColourSelect` both record - so the panel is permanently
// "open" here. That is what lets these query all 28 rows directly; opening, the `max-h-64` cap, the
// scroll box and the centring are Storybook and browser checks, because jsdom runs no layout at all.

/**
 * The closed trigger.
 *
 * Matched on the label prefix, not on "of the month": `aria-labelledby` names the shell's label
 * *and* the value, so the trigger reads "Month starts on 15th of the month" while all 28 rows read
 * "15th of the month" alone - and a suffix match would find 29 buttons.
 */
const trigger = () => screen.getByRole('button', { name: /^Month starts on/ });

/** Every row in the panel, which is every button except the trigger. */
const rows = () => screen.getAllByRole('button').filter((button) => button !== trigger());

function renderField(value = 1, onChange = jest.fn()) {
  render(
    <MonthStartField
      id="settings-month-start"
      label="Month starts on"
      value={value}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe('monthStartLabel', () => {
  it('uses the English ordinal suffixes', () => {
    expect(monthStartLabel(1)).toBe('1st of the month');
    expect(monthStartLabel(2)).toBe('2nd of the month');
    expect(monthStartLabel(3)).toBe('3rd of the month');
    expect(monthStartLabel(4)).toBe('4th of the month');
  });

  it('handles the 11-13 exception, which the mod-10 rule alone gets wrong', () => {
    // The case a naive `day % 10` table produces "11st", "12nd", "13rd" for.
    expect(monthStartLabel(11)).toBe('11th of the month');
    expect(monthStartLabel(12)).toBe('12th of the month');
    expect(monthStartLabel(13)).toBe('13th of the month');
  });

  it('resumes the suffixes above the exception', () => {
    expect(monthStartLabel(21)).toBe('21st of the month');
    expect(monthStartLabel(22)).toBe('22nd of the month');
    expect(monthStartLabel(23)).toBe('23rd of the month');
    expect(monthStartLabel(28)).toBe('28th of the month');
  });
});

describe('MonthStartField', () => {
  it('offers every day a period may start on, and no more', () => {
    // 28 is `UpdateProfileDto`'s own cap, chosen so every month has the day. A 29th row would be a
    // value the backend answers 400 for, on a control that cannot show the error.
    renderField();

    expect(rows()).toHaveLength(28);
    expect(within(rows()[0]).getByText('1st of the month')).toBeInTheDocument();
    expect(within(rows()[27]).getByText('28th of the month')).toBeInTheDocument();
    expect(screen.queryByText('29th of the month')).not.toBeInTheDocument();
  });

  it('shows the stored day on the closed trigger', () => {
    renderField(15);

    expect(trigger()).toHaveTextContent('15th of the month');
  });

  it('is named by the field label as well as its value', () => {
    // `htmlFor` names a form control and HTML-AAM computes a button's name from its own subtree, so
    // without `aria-labelledby` reaching the shell's label this would announce the value alone.
    renderField(15);

    expect(trigger()).toHaveAccessibleName('Month starts on 15th of the month');
  });

  it('marks the stored day as current and nothing else', () => {
    renderField(15);

    const current = rows().filter((row) => row.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('15th of the month');
  });

  it('hands the caller a number, never a string', async () => {
    // The reason this is a control of our own rather than a `<select>`, whose value is always text:
    // `UpdateProfileDto.monthStartDay` is `@IsInt`, so a string would be a guaranteed 400.
    const user = userEvent.setup();
    const onChange = renderField(1);

    await user.click(screen.getByRole('button', { name: '15th of the month' }));

    expect(onChange).toHaveBeenCalledWith(15);
    expect(typeof onChange.mock.calls[0][0]).toBe('number');
  });

  it('reports its own collapsed state and does not claim to be a menu or a listbox', () => {
    // Four controls in this app decline the roles-plus-keyboard promise; this is the fifth. The
    // absences are asserted because they are decisions, not oversights.
    renderField();

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).not.toHaveAttribute('aria-haspopup');
    expect(screen.queryAllByRole('listbox')).toHaveLength(0);
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.queryAllByRole('menu')).toHaveLength(0);
  });

  it('can be frozen while a save is in flight', () => {
    render(
      <MonthStartField
        id="settings-month-start"
        label="Month starts on"
        value={1}
        onChange={jest.fn()}
        disabled
      />,
    );

    expect(trigger()).toBeDisabled();
  });

  it('describes the field with its hint when one is given', () => {
    render(
      <MonthStartField
        id="settings-month-start"
        label="Month starts on"
        value={1}
        onChange={jest.fn()}
        hint="Every figure in the app is scoped to this period."
      />,
    );

    expect(
      screen.getByText('Every figure in the app is scoped to this period.'),
    ).toBeInTheDocument();
  });
});
