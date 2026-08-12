import { PreferencesProvider } from './PreferencesProvider';
import { ToastProvider } from './ToastProvider';

// The shell's contexts, for a **story** that renders a component from inside `(app)`.
//
// **`shellRender.tsx` is the same job for suites and cannot be used here**, which that file says
// itself: a suite swaps its `render` import, and a story has no render to swap. What a story must
// not do is mount these in a `decorators` array - the story smoke tests build each story from its
// `render` or from `meta.component` and **never apply a meta's decorators**, so a decorator works in
// the browser and throws under Jest. `frontend/src/app/CLAUDE.md` records that trap.
//
// **Lifted at ten consumers, not three.** Every story file that draws a modal already had a private
// two-line wrapper mounting `PreferencesProvider`; PET-77 made every one of them need a second
// provider on the same day, which is the moment ten hand-maintained copies became a liability
// rather than a convenience.
//
// The nesting matches `(app)/layout.tsx` and `shellRender.tsx`: the toast region outermost, because
// everything that can post is inside it.

/** The currency every story gets unless it mounts `PreferencesProvider` itself. */
const STORY_CURRENCY = 'USD';

export function ShellStory({
  children,
  currency = STORY_CURRENCY,
}: {
  children: React.ReactNode;
  /** For the stories whose whole point is a different currency's symbol or grouping. */
  currency?: string;
}) {
  return (
    <ToastProvider>
      <PreferencesProvider currency={currency}>{children}</PreferencesProvider>
    </ToastProvider>
  );
}
