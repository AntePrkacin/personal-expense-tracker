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

/**
 * **An exclusive union, so an action with no handler is unrepresentable.**
 *
 * `onAction` used to be optional, and omitting it shipped the control inert with `aria-disabled` -
 * which was the right shape while the screen had one live action and one with nowhere to go. PET-70
 * gave "Allocate" a destination, so both call sites pass a handler and that branch had no reachable
 * caller left: dead code plus a paragraph of comment explaining a state nothing could produce.
 *
 * A union rather than two loose props, which is the technique `ModalShape` and `ui/Button`'s
 * `href`-versus-`onClick` already use here, and it is what stops the inert case coming back by
 * accident rather than by decision. The fact-only banner survives as the arm with no action at all,
 * and `npm run build` is the gate that rejects the combination.
 */
type CardBannerProps = {
  /** The sentence. Passed as a whole string, never assembled from adjacent JSX nodes. */
  children: React.ReactNode;
} & (
  | {
      /** The action's visible label, e.g. "Allocate". */
      action: string;
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
      /**
       * What the action does.
       *
       * **This component takes no `'use client'` of its own**, so a handler has to arrive from a
       * caller that has one. `SetLimitBanner.tsx` and `AllocateBanner.tsx` are those callers and
       * exist for no other reason, which is what keeps `CategoryCard` and `SpendingSummaryCard`
       * Server Components.
       */
      onAction: () => void;
    }
  | { action?: never; actionContext?: never; onAction?: never }
);

export function CardBanner({ children, action, actionContext, onAction }: CardBannerProps) {
  return (
    <footer className="bg-primary text-primary-content mt-[calc(var(--radius-box)*-1)] flex flex-wrap items-center justify-between gap-4 rounded-b-[var(--radius-box)] px-6 pt-[calc(var(--radius-box)+0.625rem)] pb-2.5 text-sm">
      <span className="font-medium">{children}</span>

      {action === undefined ? null : (
        // **Always live now, and the `aria-disabled` half is deliberately gone.** It existed for
        // one caller - the summary card's "Allocate", which had nowhere designed to go - and PET-70
        // gave it a destination, so the attribute, its two `aria-disabled:` variants and the
        // paragraph explaining them had no reachable caller left. The union above is what keeps them
        // from returning by accident: an action with no handler no longer typechecks.
        //
        // Worth keeping from the deleted comment, because it is the reason those variants existed
        // rather than a bare `aria-disabled`: this control is text on the accent strip, not a
        // daisyUI `btn`, so it inherits none of the plugin's own disabled greying or its
        // `pointer-events: none`. Any future inert state here needs both halves written out again.
        <button
          type="button"
          onClick={onAction}
          // Composed so the visible label is always a prefix of the accessible name (WCAG 2.5.3).
          aria-label={actionContext === undefined ? undefined : `${action} for ${actionContext}`}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 font-semibold"
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
