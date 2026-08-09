import { render as rtlRender, type RenderOptions } from '@testing-library/react';

import { PreferencesProvider } from './PreferencesProvider';

// A `render` that mounts the shell's `PreferencesProvider` around whatever it is given, for the
// suites and stories that mount a money-formatting component outside `(app)/layout.tsx`.
//
// **This is Testing Library's own "custom render" pattern, and it is here to be imported instead
// of `render`, not alongside it.** Nine suites mount a component that calls `useMoney()`, several
// of them at a dozen call sites each, and `useMoney()` throws outside the provider on purpose -
// see `PreferencesProvider.tsx` for why a fallback to the default currency would be worse than a
// throw. Wrapping every one of those call sites by hand would be a hundred edits and a hundred
// chances for the next suite to forget one; swapping the import is one edit per file.
//
// **It is deliberately not a global wrapper in `jest.setup.ts`.** Two suites depend on the throw
// being reachable - `PreferencesProvider.test.tsx` asserts it directly, and `layout.test.tsx`
// proves the provider is really mounted by the layout rather than by the harness - and a setup
// file that wrapped everything would make both of them pass with the provider deleted from the
// app entirely. So a file opts in by importing from here, and the two that must not simply do not.
//
// **Storybook cannot use this**, which is worth stating so nobody tries. Story files mount their
// own provider inside `render` rather than in a `decorators` array, because the story smoke tests
// build each story from `render` or `meta.component` and never apply a meta's decorators - the
// trap `frontend/src/app/CLAUDE.md` records under Storybook. A decorator would work in the browser
// and throw under Jest.

/** The currency every suite gets unless it says otherwise, matching what a new account holds. */
const TEST_CURRENCY = 'USD';

/** The default month start day, matching the backend's own. */
const TEST_MONTH_START_DAY = 1;

function ShellPreferences({ children }: { children: React.ReactNode }) {
  return (
    <PreferencesProvider currency={TEST_CURRENCY} monthStartDay={TEST_MONTH_START_DAY}>
      {children}
    </PreferencesProvider>
  );
}

/**
 * `@testing-library/react`'s `render`, with the shell's preferences around the tree.
 *
 * Takes and returns exactly what RTL's does, so a suite swaps its import and changes nothing else.
 * A suite needing a different currency should render `PreferencesProvider` explicitly rather than
 * parameterising this - the point of the default is that most suites do not care, and one that
 * does is making an assertion about the currency and should say so at the call site.
 */
export function render(ui: React.ReactNode, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, { wrapper: ShellPreferences, ...options });
}
