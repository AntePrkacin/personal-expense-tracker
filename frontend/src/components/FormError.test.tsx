import { render, screen } from '@testing-library/react';

import { FormError } from './FormError';

// The four call sites already assert their own copy and the conditions that show it - two in
// `AddTransactionModal.test.tsx`, one each in `LoginForm`'s and `RegisterForm`'s suites. What
// is pinned here is only the contract this file owns: the assertive role, the treatment the
// field components share, and that an absent message renders no element at all.

describe('FormError', () => {
  it('announces the message assertively', () => {
    // `role="alert"`, where `ui/FieldShell`'s inline message deliberately has none. A field's
    // message appears synchronously beside the field the user just left; this one follows a
    // network round trip with nothing else on screen changing, so nothing else would tell a
    // screen reader the submit failed.
    render(<FormError message="Something went wrong. Please try again." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
  });

  it('uses the same treatment a field message does, so a form speaks one error language', () => {
    render(<FormError message="Enter an amount greater than 0." />);

    expect(screen.getByRole('alert')).toHaveClass('text-error', 'text-sm');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
  ])('renders nothing at all for %s', (_label, message) => {
    // Not an empty live region left mounted. A closed Add transaction modal contributes no text
    // to the page, which `(app)/pages.test.tsx` depends on for its inert-control assertions, and
    // an always-present alert region is one a screen reader is told about for nothing.
    const { container } = render(<FormError message={message} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
