'use client';

import { createContext, useContext, useMemo } from 'react';

import { moneyFormatters, type MoneyFormatters } from '@/lib/money';

// The two profile preferences that every screen in the shell renders through: the currency money
// is formatted in, and the day of the month a budgeting period starts on.
//
// **This exists because React context does not cross into Server Components, and half the shell is
// one.** Twelve of the sixteen components that format money are Server Components; those read the
// currency by calling `requireProfile()` in their own `page.tsx` and threading it down as a prop,
// which costs nothing now that the read is `cache()`-memoized per render. The other four are
// Client Components (`dashboard/CategoryRing`, `dashboard/TrendChart`, `DeleteTransactionDialog`
// and `transactions/categories/AllocateBudgetModal`), and prop-threading to those means passing a
// currency through every Server Component between the page and the leaf - including several that
// format nothing themselves. So the client half gets a context and the server half gets props, and
// neither is the "real" one.
//
// **It carries preferences, never the profile.** The names and the email are the sidebar footer's
// and the Settings form's, both of which already have them as props, and a context holding the
// whole profile would invite a component to read the email from here rather than from the read
// that owns it. Two fields, both of which are formatting inputs.
//
// The `'use client'` boundary is this file rather than `(app)/layout.tsx`, the rule `SidebarNav`,
// `TrendChart` and `AddTransactionProvider` all follow: push the boundary into the smallest
// wrapper, so the layout and all four pages stay off the client bundle.

type Preferences = {
  /** The profile's ISO 4217 code. Any code the backend accepts, not only the three offered. */
  currency: string;
  /**
   * The day of the month a budgeting period begins on, 1 to 28.
   *
   * Bounded at 28 by the backend so every month has the day and there is no clamping case, which
   * is what lets `periodOverline` and `periodLabel` in `lib/format.ts` derive a period's name with
   * no last-day-of-month arithmetic. It is here rather than read per screen because the header on
   * four routes needs it and none of them fetches a profile of its own.
   */
  monthStartDay: number;
};

/**
 * Exported for one reason: so `PreferencesProvider.test.tsx` can assert the `useMemo` below.
 *
 * Nothing in the app reads it directly - `useMoney`, `usePeriod` and `useCurrency` are the seams,
 * and they throw outside the provider where a bare `useContext` returns `null`. It is exported
 * because the memo protects the *context value*, and a probe on `useMoney()` cannot see that:
 * those formatters are memoized per code in a module-scope `Map`, so their identity is stable
 * however this component behaves. The first version of that test made exactly that mistake.
 */
export const PreferencesContext = createContext<(Preferences & { money: MoneyFormatters }) | null>(
  null,
);

export function PreferencesProvider({
  currency,
  monthStartDay,
  children,
}: Preferences & { children: React.ReactNode }) {
  // Memoized on the two primitives rather than on an object, so a re-render of the layout with an
  // equal profile does not hand every consumer a new value and re-render the whole shell.
  // `moneyFormatters` is itself memoized per code, so this is cheap either way; what this protects
  // is the consumers, not the construction.
  const value = useMemo(
    () => ({ currency, monthStartDay, money: moneyFormatters(currency) }),
    [currency, monthStartDay],
  );

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

/**
 * The profile's month start day, for anything naming or bounding the current budgeting period.
 *
 * Note it does **not** hand back a resolved window. The period's bounds are the backend's, resolved
 * through `src/common/month-window.ts` against `APP_TIMEZONE`, and every figure on the dashboard is
 * scoped to that one - so a frontend that computed its own would disagree with the numbers beside
 * it for the length of one timezone offset. This is for the *label*, which is the one part of a
 * period the API does not publish.
 */
export function usePeriod(): { monthStartDay: number } {
  const { monthStartDay } = usePreferences();
  return { monthStartDay };
}
