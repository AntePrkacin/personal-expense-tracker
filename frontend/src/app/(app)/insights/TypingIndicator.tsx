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
// **The dots are `aria-hidden` and the sentence is real text.** Three animated shapes say nothing
// to a screen reader; the state has to be said in words somewhere, which is the same call the trend
// chart's `sr-only` list and `SummaryBannerSkeleton`'s hidden line make.
//
// **The dots were `loading loading-dots` and are hand-rolled now (PET-76), because a `loading-*`
// animation is not CSS and cannot be tuned from CSS at all.** It reads as a class, so the obvious
// fix for dots that look static is an `animation-duration` beside it - and that reaches nothing.
// `daisyui/components/loading.css` implements the mark as a `mask-image` data-URI **SVG** carrying
// SMIL `<animate>` elements: `dur='3s'` with `keyTimes='0;0.286;0.571;1'`, so each dot hops once
// inside the first 57% of the timeline and then holds still for roughly 1.3 seconds. No class, no
// theme variable and no utility can touch a value inside a URL, which is why the indicator read as
// a decoration rather than as activity. `frontend/CLAUDE.md`'s Where daisyUI and Tailwind fight
// carries the general form.
//
// **Three spans on Tailwind's own `animate-bounce`, staggered by negative `animation-delay`**, are
// the replacement: real CSS animations, so the duration is a number in this file. Plus
// `motion-reduce:animate-none`, which costs nothing here because the dots are already `aria-hidden`
// and the state is carried by the sentence beside them - there is no information in the motion.

/** Ours, like every string on these two screens. Joins what A29 owes a designer. */
export const THINKING_TEXT = 'Reading your transactions…';

/**
 * The animated box, which is deliberately larger than the dot it draws.
 *
 * **`animate-bounce` translates by `-25%` of the element's own height**, so the dot's travel is a
 * quarter of whatever it is sized to - and a 6px dot moving 1.5px is the static-looking indicator
 * this component is replacing, arrived at from the other direction. daisyUI's own mark travels a
 * full dot diameter (its SVG moves `cy` from 12 to 6 on `r='3'`), so the animated box is `size-4`
 * around a `size-1.5` dot: 4px of travel on a 6px mark, which is that amplitude within a pixel.
 *
 * The duration is a literal because being able to write one is the entire point of the change.
 */
const DOT_BOX =
  'flex size-4 items-center justify-center animate-bounce [animation-duration:960ms] motion-reduce:animate-none';

/**
 * The phase offset per dot, as whole class literals - the `ui/categoryColour.ts` convention, since
 * Tailwind's scanner reads source as raw text and an interpolated `[animation-delay:${n}ms]`
 * compiles to nothing at all with no build error.
 *
 * **Negative rather than positive**, which is what makes the wave start immediately: a positive
 * delay would hold all three dots still for the first third of a second every time the region
 * fills, and the region fills exactly when the user is watching for a sign that anything happened.
 */
const DOT_DELAY = [
  '[animation-delay:-320ms]',
  '[animation-delay:-160ms]',
  '[animation-delay:0ms]',
] as const;

export function TypingIndicator({ pending }: { pending: boolean }) {
  return (
    <p
      role="status"
      // Mounted from the first render. See the header comment - this is not a stylistic choice.
      className="text-base-content/60 flex min-h-6 items-center gap-2 text-sm"
    >
      {pending ? (
        <>
          {/* One `aria-hidden` on the group rather than one per dot: the whole ornament is the
              thing being hidden, and the sentence after it is what a reader gets instead. */}
          <span aria-hidden="true" className="flex items-center">
            {DOT_DELAY.map((delay) => (
              <span key={delay} className={`${DOT_BOX} ${delay}`}>
                <span className="bg-base-content/60 size-1.5 rounded-full" />
              </span>
            ))}
          </span>
          {THINKING_TEXT}
        </>
      ) : null}
    </p>
  );
}
