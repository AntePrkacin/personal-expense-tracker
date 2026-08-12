import { CATEGORY_DOT, type CategoryColour } from '@/components/ui/categoryColour';

// The right half of 01 Welcome (Figma node 41:711): a dark panel with two washes
// of accent, a sample budget card and two floating category chips.
//
// **Display only.** WEL-4 says so and AC4 pins it: nothing here is clickable,
// nothing here is real, and the whole subtree is hidden from assistive technology.
// It exists to show a prospective user what the product looks like, which is a job
// the left column's intro copy already does in words.
//
// It is a file of its own rather than 70 lines inside WelcomeScreen because it has
// the opposite accessibility contract from everything around it, and the filename
// is the cheapest place to say so. Same colocation call as
// app/(app)/dashboard/MonthPill.tsx.
//
// `ui/ProgressBar` and `ui/Tag` were deleted with the token layer, so the bar and
// the pill are daisyUI markup inlined here: a native `<progress class="progress">`
// and a `<span class="badge">`. There is nothing shared left to import, which is
// the point - two decorative shapes on one marketing panel are not a component.

/**
 * The card's numbers, and they are **permanent marketing copy**.
 *
 * Nothing should ever wire these to `GET /api/profile`. They are the figures the
 * designer drew on the frame, and they stay.
 *
 * The strings are literal rather than `formatCurrency` output on purpose:
 * `formatCurrency(1240)` is `"$1,240.00"` (pinned in lib/format.test.ts) and the
 * frame draws `"$1,240"`, so the shared formatter cannot produce these at all.
 * That gap is real for whoever builds the dashboard's own budget card, which
 * cannot sidestep it the way this can - see docs/TODO.md.
 */
const SAMPLE_BUDGET = {
  spent: 1240,
  budget: 2000,
  spentLabel: '$1,240',
  budgetLabel: 'of $2,000',
  // U+00B7 MIDDLE DOT, as drawn, not a hyphen or a bullet.
  remaining: '$760 left · 8 days to go',
} as const;

/**
 * The two chips, positioned as Figma places them (node 41:726 and 41:730).
 *
 * The position classes are complete literal strings in the data rather than built
 * from the numbers, because Tailwind's scanner reads this file as raw text: a class
 * assembled by interpolation is found by nobody and compiles to nothing, with no
 * build error. Same rule as CATEGORY_DOT itself.
 *
 * `colour` is typed `CategoryColour` so a typo is a build error, and the fill comes
 * from CATEGORY_DOT rather than being written inline, which documents that these
 * two dots are category colours rather than arbitrary ones. Figma binds them to
 * Category/1 Coral and Category/6 Blue, which PET-64 re-expressed as the daisyUI
 * tokens the app actually paints: `error` and `info`, the same two Healthcare and
 * Transportation carry.
 */
const SAMPLE_CHIPS: readonly {
  label: string;
  amount: string;
  colour: CategoryColour;
  position: string;
}[] = [
  // left 210, top 220
  { label: 'Dining', amount: '$298', colour: 'error', position: 'top-55 left-52.5' },
  // left 60, top 520
  { label: 'Transport', amount: '$223', colour: 'info', position: 'top-130 left-15' },
];

function SampleBudgetCard() {
  return (
    // left 100, top 300, width 360, which is Figma's placement. Everything else -
    // the surface, the radius, the elevation - is stock daisyUI `card`, so this
    // panel's card and the real dashboard's card cannot drift apart by hand.
    //
    // shadow-2xl rather than the card's usual elevation: it sits on the dark panel,
    // where the designed shadow is far deeper than the one a card on the light
    // canvas carries.
    <div className="card bg-base-100 text-base-content absolute top-75 left-25 w-90 shadow-2xl">
      <div className="card-body gap-3.5">
        <div className="flex items-center justify-between">
          {/* A <p>, not an <h2>. It is fabricated and outside the document outline.
              aria-hidden keeps it out of the heading rotor either way, but a heading
              here would be wrong the day somebody removes that. */}
          <p className="text-base-content/70 text-sm font-medium">October budget</p>
          <span className="badge badge-soft badge-success">On track</span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <p className="font-display text-4xl font-bold">{SAMPLE_BUDGET.spentLabel}</p>
          <p className="text-base-content/60 text-sm">{SAMPLE_BUDGET.budgetLabel}</p>
        </div>

        {/* No colour modifier, per daisyUI's own rule for a routine progress bar.
            Real numbers rather than the 150/240 the Figma instance happens to draw,
            which is only the component's own default fill.

            A native <progress> carries role="progressbar" implicitly, which is the
            reason the whole panel is aria-hidden - see the note on the export. */}
        <progress
          className="progress w-full"
          value={SAMPLE_BUDGET.spent}
          max={SAMPLE_BUDGET.budget}
        />

        <p className="text-base-content/70 text-sm font-medium">{SAMPLE_BUDGET.remaining}</p>
      </div>
    </div>
  );
}

function SampleChip({ label, amount, colour, position }: (typeof SAMPLE_CHIPS)[number]) {
  return (
    // pl-3/pr-3.5 is the asymmetric 12/14 Figma draws. A shallower elevation than
    // the card above it, for the reason that one records.
    <div
      className={`bg-base-100 text-base-content absolute flex items-center gap-2 rounded-full py-2.5 pr-3.5 pl-3 shadow-lg ${position}`}
    >
      {/* `CATEGORY_DOT`, not `CATEGORY_TILE`: `.status` draws its drop shadow from
          `currentColor` and sets `color` to a translucent black for it, so a tile's
          `text-*-content` half makes that shadow an opaque coloured smudge.
          `ui/categoryColour.ts` records it. */}
      <span className={`status status-md shrink-0 ${CATEGORY_DOT[colour]}`} />
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-base-content/60 text-xs">{amount}</p>
    </div>
  );
}

export function DecorativePanel() {
  return (
    // aria-hidden on the whole panel, which is load-bearing rather than tidy. The
    // native <progress> inside publishes role="progressbar", so unhidden this
    // announces a real progressbar reporting a real-sounding 62% of a budget that is
    // not the reader's, and the badge announces "On track" as if it were a statement
    // about their finances. Every figure in here is invented and stays invented.
    //
    // Note aria-hidden on an ancestor does NOT remove focusable descendants from
    // the tab order - the classic footgun. There are none (the bar, the badge and
    // the chips are all progress, span and div), and WelcomeScreen.test.tsx pins
    // that so a later ticket cannot add one.
    //
    // A plain <div>, never an <aside>: an aria-hidden landmark is
    // self-contradictory. The runner-up, role="img" with a summarising aria-label,
    // was rejected because Figma draws no caption, so the label would be copy
    // nobody wrote.
    //
    // `hidden lg:block` is what makes Welcome stack on a narrow screen: the panel is
    // decoration by definition, so dropping it costs a small viewport nothing, and
    // the alternative - reflowing absolutely placed art under the copy - would show
    // a broken version of a frame that is not information. w-140 is the designed
    // 560px above that breakpoint and needs shrink-0 so the flex row cannot compress
    // it. overflow-hidden is what clips the two circles, and it belongs here rather
    // than on the page so the frame keeps its no-scroll promise.
    //
    // data-theme="expensa-light" pins the subtree, which is daisyUI's own mechanism
    // for a section that must not follow the page. The art is drawn as a bright card
    // on ink: the card is `base-100` on a `neutral` panel, a pairing that only
    // contrasts while base-100 is light, and the dark theme's base-100 is itself
    // near-ink - so without the pin the card and both accent washes sank into the
    // panel. Every figure in here is fabricated and permanently so; there is
    // nothing for the reader's theme to adapt. This is not the `dark:` variant the
    // design-token rules forbid - nothing here forks on the theme, it opts out.
    //
    // **The value must be a registered theme's name, and this pin was dead for the
    // first half of PET-74.** It said `light`, and the moment the stock pair was
    // replaced by the Expensa pair, `[data-theme="light"]` matched no emitted
    // selector - so the pin silently stopped pinning and the panel followed the
    // page theme, with every gate green. Nothing checks an attribute value against
    // the theme registration; a rename in `globals.css` has to sweep for
    // `data-theme` literals by hand.
    <div
      aria-hidden="true"
      data-theme="expensa-light"
      className="bg-neutral text-neutral-content relative hidden w-140 shrink-0 overflow-hidden lg:block"
    >
      {/* Two washes of accent, bleeding off two edges. The exported SVGs were
          inspected: plain solid circles, no blur, no gradient, so a div with a
          background and an opacity is the same paint rather than a redraw - do not
          reach for `blur-*` from a screenshot.

          Figma fills both `#4F45E6`, which is unbound to any variable, i.e. a slip.
          We ship the theme's own `primary` instead: a raw hex here would be the one
          fixed colour in the whole frontend and would not follow the theme.
          Recorded in docs/TODO.md so the designer can bind the layer.

          size-130 is 520px at left 180 / top -140; size-90 is 360px at left -120 /
          top 640. Figma reports those as the bounding box's top-left, so they read
          straight across.

          DOM order is the z-order: circles, then the card, then the chips, all in
          one stacking context, so later siblings paint on top. No z-index is
          needed and adding one is the reflex fix if somebody reorders these. */}
      <div className="bg-primary absolute size-130 rounded-full opacity-28 left-45 -top-35" />
      <div className="bg-primary absolute size-90 rounded-full opacity-18 -left-30 top-160" />

      <SampleBudgetCard />

      {SAMPLE_CHIPS.map((chip) => (
        <SampleChip key={chip.label} {...chip} />
      ))}
    </div>
  );
}
