import { render as rtlRender, type RenderOptions } from '@testing-library/react';

import { PreferencesProvider } from './PreferencesProvider';
import { ToastProvider } from './ToastProvider';

// A `render` that mounts the shell's `PreferencesProvider` and `ToastProvider` around whatever it
// is given, for the suites and stories that mount a shell component outside `(app)/layout.tsx`.
//
// **PET-77 added the second provider, and it widened what this harness is for.** It was "the money
// one"; it is now "the shell's contexts", because `useToast()` throws outside its provider for the
// same reason `useMoney()` does - a write whose confirmation silently stops appearing is a bug that
// looks like a fast network. Twelve components post now, and every suite that mounts one would
// otherwise wrap it by hand. The exemption below applies unchanged to both: `layout.test.tsx`
// proves the layout really mounts them, so it must not render through this.
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

function ShellPreferences({ children }: { children: React.ReactNode }) {
  // Same order as `(app)/layout.tsx`: the toast region outermost, because everything that can post
  // is inside it. Nothing here depends on that ordering the way the app does - neither provider
  // reads the other - and it matches anyway, so a suite is never testing an arrangement the app
  // does not have.
  return (
    <ToastProvider>
      <PreferencesProvider currency={TEST_CURRENCY}>{children}</PreferencesProvider>
    </ToastProvider>
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
