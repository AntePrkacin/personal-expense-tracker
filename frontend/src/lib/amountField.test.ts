import { reformatAmountInput } from './amountField';
import { amountCaret, formatAmountInput } from './format';

// The four call sites' suites each assert that `setSelectionRange` was called with the computed
// offset, which is all any of them can see from behind `userEvent`. This one is what the lift buys:
// the handler is a plain function over an element now, so the DOM write, the returned value and the
// caret can be pinned directly, once, rather than four times through four forms.
//
// jsdom still cannot say whether the caret *looks* right - `lib/amountField.ts` records why, and
// `docs/TODO.md` carries the gap - so nothing here asserts `selectionStart`.

function field(value: string, caret = value.length): HTMLInputElement {
  const element = document.createElement('input');

  element.value = value;
  element.setSelectionRange = jest.fn();
  element.selectionStart = caret;

  return element;
}

it('writes the formatted value onto the element and answers it', () => {
  const element = field('2000');

  const returned = reformatAmountInput(element);

  expect(element.value).toBe('2,000');
  expect(returned).toBe('2,000');
});

// The whole reason the handler exists rather than a bare `setState`: React restores the raw offset,
// which lands to the left of a separator the reformat just inserted.
it('restores the semantic caret rather than the raw offset', () => {
  const element = field('2000', 4);

  reformatAmountInput(element);

  const expected = amountCaret('2000', 4, '2,000');
  expect(element.setSelectionRange).toHaveBeenCalledWith(expected, expected);
  expect(expected).toBe(5);
});

// The second pass React causes by handing the formatted value straight back through `value`. It must
// move nothing, which is `formatAmountInput`'s idempotence seen from the caller that depends on it.
it('is idempotent, so React handing the value back changes nothing', () => {
  const element = field(reformatAmountInput(field('2000')));

  const returned = reformatAmountInput(element);

  expect(returned).toBe('2,000');
  expect(element.value).toBe('2,000');
});

// Mid-keystroke states the formatter deliberately preserves: a trailing separator and a partial
// fraction are things a person types on the way to a number, and `formatCurrency` would eat both.
it.each(['', '24.', '24.5', '1,234.56'])('leaves %p as the formatter does', (raw) => {
  const element = field(raw);

  expect(reformatAmountInput(element)).toBe(formatAmountInput(raw));
});

// `selectionStart` reads `null` on an input whose type does not support selection - `number`,
// `email` and friends. The currency field is a `text` input so it never does, but the type says it
// can, and answering `0` there would jump the caret to the front of the value on every keystroke.
//
// Defined rather than assigned: jsdom coerces `element.selectionStart = null` to `0`, which is the
// value this case exists to distinguish from.
it('falls back to the end of the value when there is no selection', () => {
  const element = field('2000');
  Object.defineProperty(element, 'selectionStart', { value: null });

  reformatAmountInput(element);

  const expected = amountCaret('2000', 4, '2,000');
  expect(element.setSelectionRange).toHaveBeenCalledWith(expected, expected);
});
