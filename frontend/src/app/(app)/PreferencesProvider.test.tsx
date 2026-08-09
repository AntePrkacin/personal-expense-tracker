import { render, screen } from '@testing-library/react';

import { PreferencesProvider, useMoney, usePeriod } from './PreferencesProvider';

// The shell's currency and month-start context. Its whole job is being correct about which
// profile it is reporting, so the tests are about the two failure modes that look like success:
// formatting a euro account in dollars, and resolving outside the provider at all.

function Money() {
  const { formatCurrency, formatWhole, formatNegative } = useMoney();

  return (
    <ul>
      <li>{formatCurrency(1240.5)}</li>
      <li>{formatWhole(1240.5)}</li>
      <li>{formatNegative(24)}</li>
    </ul>
  );
}

function Period() {
  return <p>{usePeriod().monthStartDay}</p>;
}

describe('PreferencesProvider', () => {
  it('binds the money formatters to the profile currency', () => {
    render(
      <PreferencesProvider currency="EUR" monthStartDay={1}>
        <Money />
      </PreferencesProvider>,
    );

    expect(screen.getByText('€1,240.50')).toBeInTheDocument();
    expect(screen.getByText('€1,241')).toBeInTheDocument();
    expect(screen.getByText('−€24.00')).toBeInTheDocument();
  });

  it('reports the profile month start day', () => {
    render(
      <PreferencesProvider currency="USD" monthStartDay={15}>
        <Period />
      </PreferencesProvider>,
    );

    expect(screen.getByText('15')).toBeInTheDocument();
  });

  describe('outside the provider', () => {
    it('throws from useMoney rather than falling back to the default currency', () => {
      // The call `useAddTransaction`, `useDeleteTransaction`, `useEditTransaction` and
      // `useFilterNavigation` all make, and it matters more here than for any of them: a fallback
      // would render a euro account's figures in dollars, silently, on a screen that looks
      // entirely correct. A throw fails the first test to mount the component without the
      // provider, which is this one.
      expect(() => render(<Money />)).toThrow(/PreferencesProvider/);
    });

    it('throws from usePeriod too', () => {
      expect(() => render(<Period />)).toThrow(/PreferencesProvider/);
    });
  });

  it('hands consumers a stable value across a re-render with equal preferences', () => {
    // The memo is on the two primitives rather than on an object, so a layout re-render with an
    // equal profile must not hand every consumer in the shell a new context value. `page.tsx`
    // builds a fresh profile object on every server render, which is the case that makes an
    // identity-keyed memo fire constantly - the same trap `SettingsForm`'s resync records.
    const seen: unknown[] = [];

    function Probe() {
      seen.push(useMoney());
      return null;
    }

    const { rerender } = render(
      <PreferencesProvider currency="USD" monthStartDay={1}>
        <Probe />
      </PreferencesProvider>,
    );

    rerender(
      <PreferencesProvider currency="USD" monthStartDay={1}>
        <Probe />
      </PreferencesProvider>,
    );

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });

  it('rebinds when the currency changes', () => {
    const { rerender } = render(
      <PreferencesProvider currency="USD" monthStartDay={1}>
        <Money />
      </PreferencesProvider>,
    );

    expect(screen.getByText('$1,240.50')).toBeInTheDocument();

    rerender(
      <PreferencesProvider currency="GBP" monthStartDay={1}>
        <Money />
      </PreferencesProvider>,
    );

    expect(screen.getByText('£1,240.50')).toBeInTheDocument();
  });
});
