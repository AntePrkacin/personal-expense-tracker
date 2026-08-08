import { ArrowRight } from 'lucide-react';

// The tinted strip that extends a card past its body, from the team's Claude Design system
// (`ui_kits/expensa-app/Shell.jsx`'s `CardBanner`, used by `Card`'s `footer` slot).
//
// **The card overlaps the strip rather than containing it**, which is the whole effect and the
// one thing worth getting right. The card body keeps all four corners rounded and paints over
// the banner; the banner is pulled up by exactly one card radius and rounds only its bottom
// corners. So the strip appears to slide out from behind the card's lower edge instead of
// reading as a second block stacked under it. The source does this with
// `marginTop: calc(var(--r-lg) * -1)` and `zIndex: 1` on the body, and this is that in daisyUI's
// own tokens.
//
// **`var(--radius-box)` is referenced directly rather than through a `rounded-b-box` class.**
// daisyUI ships `rounded-box`, but a *directional* variant of it is not a documented utility,
// and this repo's standing hazard is that a class Tailwind never compiled paints nothing with
// every gate green. An arbitrary value naming the variable cannot fail that way, and it stays
// theme-aware because the variable is what daisyUI's own `.card` reads.
//
// **Solid `primary`, not a soft tint**, following the source's own note that "the tinted variant
// was too quiet to notice". That is semantic rather than decorative: the strip exists to be
// acted on, and `primary` is what this app already reserves for the one emphasized action on a
// screen. `text-primary-content` is its paired foreground, so the pair follows the theme in both
// light and dark with no `dark:` variant.
//
// **No `role="alert"`.** An earlier version of this had one, and it was wrong: `alert` is an
// assertive live region, so a banner that is simply present when the page loads would interrupt
// a screen reader to announce something nothing had just changed. It is ordinary text with an
// ordinary button. `<footer>` rather than `<div>` because that is what it is - and a `footer`
// whose nearest ancestor is a `<section>` is not the `contentinfo` landmark, so it adds meaning
// without adding a second page-level region.

type CardBannerProps = {
  /** The sentence. Passed as a whole string, never assembled from adjacent JSX nodes. */
  children: React.ReactNode;
  /** The action's visible label, e.g. "Allocate". Omit for a banner that only states a fact. */
  action?: string;
  /**
   * What this particular action acts on, when the visible label is not distinct on its own.
   *
   * Eight category cards each drawing "Set limit" would announce as eight identical buttons, so
   * the card passes its category name and the accessible name becomes "Set limit for Groceries".
   * The summary card's "Allocate" is unique on the screen and passes nothing.
   *
   * **A context to append rather than a replacement label, and that is WCAG 2.5.3 rather than a
   * preference.** The first version took the whole accessible name and the card passed "Set a
   * monthly limit for Groceries" - which does not contain the visible string "Set limit", so a
   * speech-input user saying "click Set limit", the only words on screen, matched nothing and
   * could not activate the one control on the card. Composing the name here instead of trusting
   * each call site makes the visible label a prefix by construction, so the violation is not
   * reachable.
   */
  actionContext?: string;
};

export function CardBanner({ children, action, actionContext }: CardBannerProps) {
  return (
    <footer className="bg-primary text-primary-content mt-[calc(var(--radius-box)*-1)] flex flex-wrap items-center justify-between gap-4 rounded-b-[var(--radius-box)] px-6 pt-[calc(var(--radius-box)+0.625rem)] pb-2.5 text-sm">
      <span className="font-medium">{children}</span>

      {action === undefined ? null : (
        // Inert on the same terms as the card kebab and the header's "Add category": the control
        // that assigns a budget to a category is PET-37's Add category modal and PET-38's Edit.
        // `aria-disabled` rather than `disabled`, so it stays focusable and announces its state
        // instead of vanishing from the tab order.
        <button
          type="button"
          aria-disabled="true"
          // Composed so the visible label is always a prefix of the accessible name (WCAG 2.5.3).
          aria-label={actionContext === undefined ? undefined : `${action} for ${actionContext}`}
          // **`aria-disabled:` variants, because `aria-disabled` alone tells a sighted mouse
          // user nothing.** The screen's other two inert controls wear daisyUI's `btn`, which
          // greys them and sets `pointer-events: none` from its own
          // `.btn:is([aria-disabled=true])` rule. This one is bare text on the accent strip, so
          // it got none of that and previously carried an unconditional `cursor-pointer` - it
          // looked and hovered exactly like a live button and did nothing on click, which is the
          // failure this file's comment above claims `aria-disabled` avoids. Written as
          // `aria-disabled:` variants rather than flat classes so PET-38 gets the live styling
          // back by deleting the attribute, with nothing here left to remember.
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 font-semibold aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          {action}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </footer>
  );
}

/**
 * The card body that a `CardBanner` slides out from behind.
 *
 * Exists so the two halves of the effect cannot drift apart: the negative margin above is
 * measured against this element's radius, and `relative z-1` is what makes the body paint over
 * the strip rather than under it. A card with no banner does not need either, which is why this
 * is opt-in rather than folded into every card on the screen.
 *
 * `z-1` rather than a large number, deliberately - the two elements are siblings, so the
 * smallest value that orders them is the correct one.
 */
export function BannerCardBody({ children }: { children: React.ReactNode }) {
  return <div className="card bg-base-100 relative z-1 shadow-sm">{children}</div>;
}
