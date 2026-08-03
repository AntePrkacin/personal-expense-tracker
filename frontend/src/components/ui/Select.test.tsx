import { render, screen } from '@testing-library/react';

import { FIELD_CONTROL_SURFACE } from './Field';
import { SELECT_CONTROL, Select } from './Select';

const CATEGORIES = [
  { value: 'groceries', label: 'Groceries' },
  { value: 'transport', label: 'Transport' },
  { value: 'housing', label: 'Housing' },
];

const renderSelect = (props: Partial<React.ComponentProps<typeof Select>> = {}) =>
  render(<Select id="category" label="Category" options={CATEGORIES} {...props} />);

/**
 * The values of every option, in DOM order.
 *
 * Queried through the DOM rather than `getAllByRole('option')` because a `hidden`
 * option - which is what the placeholder is - resolves no accessible name, so any
 * role query filtered by name silently matches nothing whether it is there or not.
 */
const optionValues = (select: HTMLElement) =>
  Array.from(select.querySelectorAll('option')).map((option) => option.value);

describe('Select', () => {
  it('is reachable by its label', () => {
    renderSelect();

    expect(screen.getByLabelText('Category')).toBe(screen.getByRole('combobox'));
  });

  it('renders one option per entry', () => {
    renderSelect();

    expect(screen.getAllByRole('option')).toHaveLength(CATEGORIES.length);
    expect(screen.getByRole('option', { name: 'Groceries' })).toHaveValue('groceries');
  });

  it('applies its designed padding and hides the native arrow', () => {
    // appearance-none is what removes the platform chevron, so the designed one
    // is not drawn beside a second arrow.
    renderSelect();

    expect(screen.getByRole('combobox')).toHaveClass(...SELECT_CONTROL.split(' '));
  });

  it('shows the placeholder as the selection without offering it in the list', () => {
    // "Select..." is what the tile draws. `hidden` keeps it out of the dropdown,
    // `disabled` plus `required` keeps it from being submitted.
    renderSelect({ placeholder: 'Select…' });

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('');
    expect(select).toHaveDisplayValue('Select…');
    expect(optionValues(select)).toEqual(['', ...CATEGORIES.map(({ value }) => value)]);
  });

  it('selects the value it is given rather than the placeholder', () => {
    renderSelect({ placeholder: 'Select…', defaultValue: 'transport' });

    expect(screen.getByRole('combobox')).toHaveValue('transport');
  });

  it('renders no placeholder option when none is asked for', () => {
    // Asserted through the option values, not through
    // `queryByRole('option', { hidden: true, name: 'Select…' })`. That query
    // returns null even when the placeholder IS rendered, because an accessible
    // name does not resolve for a `hidden` <option> - so the negative case passed
    // either way and the test could not fail.
    renderSelect();

    expect(optionValues(screen.getByRole('combobox'))).toEqual(
      CATEGORIES.map(({ value }) => value),
    );
  });

  it('names the field after its id unless told otherwise', () => {
    renderSelect();

    expect(screen.getByRole('combobox')).toHaveAttribute('name', 'category');
  });

  it('is valid and undescribed until an error is passed', () => {
    renderSelect();

    const select = screen.getByRole('combobox');
    expect(select).not.toHaveAttribute('aria-invalid');
    expect(select).not.toHaveAttribute('aria-describedby');
  });

  it('uses the same error pattern as Input', () => {
    // The acceptance criterion is that one pattern appears in every form, which is
    // structural here: both field types run through Field.
    renderSelect({ error: 'Pick a category.' });

    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAttribute('aria-describedby', 'category-error');
    expect(screen.getByText('Pick a category.')).toHaveAttribute('id', 'category-error');
    expect(select.parentElement).toHaveClass('border-status-danger');
  });

  it('looks inert when disabled, not merely refuse input', () => {
    // Author styles beat the user agent's own disabled treatment, so without an
    // explicit disabled fill the control renders identically to an editable one.
    renderSelect({ disabled: true });

    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
    expect(select).toHaveClass('disabled:text-text-tertiary');
    expect(select.parentElement).toHaveClass(...FIELD_CONTROL_SURFACE.disabled.split(' '));
    expect(select.parentElement).not.toHaveClass('bg-surface-card');
  });

  it('layers the chevron over the control without stealing its clicks', () => {
    renderSelect();

    const chevron = screen.getByRole('combobox').parentElement?.querySelector('svg');
    expect(chevron).toHaveAttribute('aria-hidden', 'true');
    expect(chevron).toHaveClass('pointer-events-none', 'absolute', 'overflow-visible');
  });
});
