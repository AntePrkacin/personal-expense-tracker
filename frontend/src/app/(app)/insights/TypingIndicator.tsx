// The assistant's "thinking" line, and the whole of what makes it correct is that it is always
// mounted.
//
// **A polite live region created in the same commit as its content is generally not announced at
// all**: assistive technology registers regions and then watches them for changes, so a region
// that appears with its text already in it has nothing to observe. That is the review finding
// `AllocateBudgetModal` produced and `settings/SettingsForm` inherited, and it transfers here
// exactly - which is why this component renders the region unconditionally and swaps only its
// text, and why its suite asserts the region's **text** rather than its presence.
// `getByRole('status')` cannot tell a working region from a silent one.
//
// **The dots are `aria-hidden` and the sentence is real text.** A `loading loading-dots` is three
// animated shapes to a screen reader; the state has to be said in words somewhere, which is the
// same call the trend chart's `sr-only` list and `SummaryBannerSkeleton`'s hidden line make.

/** Ours, like every string on these two screens. Joins what A29 owes a designer. */
export const THINKING_TEXT = 'Reading your transactions…';

export function TypingIndicator({ pending }: { pending: boolean }) {
  return (
    <p
      role="status"
      // Mounted from the first render. See the header comment - this is not a stylistic choice.
      className="text-base-content/60 flex min-h-6 items-center gap-2 text-sm"
    >
      {pending ? (
        <>
          <span aria-hidden="true" className="loading loading-dots loading-sm" />
          {THINKING_TEXT}
        </>
      ) : null}
    </p>
  );
}
