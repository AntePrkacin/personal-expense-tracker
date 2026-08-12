'use client';

import { createContext, useContext, useMemo } from 'react';

import { moneyFormatters, type MoneyFormatters } from '@/lib/money';

// The one profile preference that every screen in the shell renders through: the currency money is
// formatted in.
//
// **It carried a second, `monthStartDay`, and PET-72 removed it rather than rewiring it.** That field
// and its `usePeriod` seam existed for one job - letting a client component name the budgeting period
// through `lib/format.ts`'s `periodOverline` - and that job is gone: a period is not always a
// calendar month offset by a fixed day, so its name is `GET /api/periods`' to answer and arrives
// beside the figures it describes. Nothing read the seam by the time it went, and leaving it would
// have been worse than dead code: a day is still enough to *compute* a plausible label with, so the
// next screen to reach for it would have got a wrong one with every gate green.
//
// **This exists because React context does not cross into Server Components, and half the shell is
// one.** Twelve of the sixteen components that format money are Server Components; those read the
// currency by calling `requireProfile()` in their own `page.tsx` and threading it down as a prop,
// which costs nothing now that the read is `cache()`-memoized per render. The other four are
// Client Components (`dashboard/TrendChart`, `DeleteTransactionDialog`,
// `transactions/categories/AllocateBudgetModal` - and `dashboard/CategoryRing` until PET-78
// deleted the hover tooltip that was its only caller, so read that count as three), and
// prop-threading to those means passing a
// currency through every Server Component between the page and the leaf - including several that
// format nothing themselves. So the client half gets a context and the server half gets props, and
// neither is the "real" one.
//
// **It carries preferences, never the profile.** The name and the email are the sidebar footer's
// and the Settings form's, both of which already have them as props, and a context holding the
// whole profile would invite a component to read the email from here rather than from the read
// that owns it. One field, and it is a formatting input.
//
// The `'use client'` boundary is this file rather than `(app)/layout.tsx`, the rule `SidebarNav`,
// `TrendChart` and `AddTransactionProvider` all follow: push the boundary into the smallest
// wrapper, so the layout and all four pages stay off the client bundle.

type Preferences = {
  /** The profile's ISO 4217 code. Any code the backend accepts, not only the ones the picker offers. */
  currency: string;
};

/**
 * Exported for one reason: so `PreferencesProvider.test.tsx` can assert the `useMemo` below.
 *
 * Nothing in the app reads it directly - `useMoney` and `useCurrency` are the two seams, and they
 * throw outside the provider where a bare `useContext` returns `null`. It is exported
 * because the memo protects the *context value*, and a probe on `useMoney()` cannot see that:
 * those formatters are memoized per code in a module-scope `Map`, so their identity is stable
 * however this component behaves. The first version of that test made exactly that mistake.
 */
export const PreferencesContext = createContext<(Preferences & { money: MoneyFormatters }) | null>(
  null,
);

export function PreferencesProvider({
  currency,
  children,
}: Preferences & { children: React.ReactNode }) {
  // Memoized on the primitive rather than on an object, so a re-render of the layout with an equal
  // profile does not hand every consumer a new value and re-render the whole shell.
  // `moneyFormatters` is itself memoized per code, so this is cheap either way; what this protects
  // is the consumers, not the construction.
  const value = useMemo(() => ({ currency, money: moneyFormatters(currency) }), [currency]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

function usePreferences() {
  const value = useContext(PreferencesContext);

  // Throws outside the provider rather than falling back to the default currency, the call
  // `useAddTransaction`, `useDeleteTransaction`, `useEditTransaction` and `useFilterNavigation` all
  // make. A fallback here is worse than those: it would render a euro account's figures in dollars,
  // silently, on a screen that looks entirely correct - where a throw fails the first test to mount
  // the component without the provider.
  if (value === null) {
    throw new Error('usePreferences must be used inside PreferencesProvider.');
  }

  return value;
}

/**
 * The three money formatters, bound to the signed-in user's currency.
 *
 * The client-side counterpart of `moneyFormatters(profile.currency)`, which is what a Server
 * Component calls. Deliberately returns the same `MoneyFormatters` shape, so a component that
 * changes sides keeps its call sites.
 */
export function useMoney(): MoneyFormatters {
  return usePreferences().money;
}

/**
 * The profile's ISO 4217 code, for the one thing a formatter cannot answer: a bare symbol.
 *
 * `ui/Input`'s `variant="currency"` draws a prefix glyph rather than a formatted amount, and it drew
 * a literal `$` until a code review caught it - so a EUR account was asked to type pounds into a
 * field labelled with dollars while every figure around it had already followed the profile. Callers
 * pass `currencySymbol(useCurrency())` into that prop rather than this component reading a context,
 * which keeps `ui/` primitives on props the way the rest of that folder is.
 */
export function useCurrency(): string {
  return usePreferences().currency;
}
