import { CATEGORY_TILE, type CategoryColour } from '@/components/ui/categoryColour';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Tag } from '@/components/ui/Tag';

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

/**
 * The card's numbers, and they are **permanent marketing copy**.
 *
 * Named as loudly as PLACEHOLDER_PROFILE in app/(app)/layout.tsx, but note the
 * opposite meaning: that constant is a placeholder waiting for a real read, and
 * this one is not. Nothing should ever wire these to `GET /api/profile`. They are
 * the figures the designer drew on the frame, and they stay.
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
 * build error. Same rule as CATEGORY_TILE itself.
 *
 * `colour` is typed `CategoryColour` so a typo is a build error, and the fill comes
 * from CATEGORY_TILE rather than being written inline, which documents that these
 * two dots are category colours rather than arbitrary ones. Figma binds them to
 * Category/1 Coral and Category/6 Blue.
 */
const SAMPLE_CHIPS: readonly {
  label: string;
  amount: string;
  colour: CategoryColour;
  position: string;
}[] = [
  // left 210, top 220
  { label: 'Dining', amount: '$298', colour: 'coral', position: 'top-55 left-52.5' },
  // left 60, top 520
  { label: 'Transport', amount: '$223', colour: 'blue', position: 'top-130 left-15' },
];

function SampleBudgetCard() {
  return (
    // left 100, top 300, width 360. px-6.5 is the designed 26px, and pt-6/pb-6.5
    // the 24/26 split Figma draws rather than an even pad.
    //
    // The shadow is an arbitrary literal because Foundations declares no shadow
    // tokens and nothing else in the repo uses a shadow utility - this and the
    // chip below are the first two. It is deliberately absent from
    // ui/utilities.test.ts: it compiles to literal CSS with no token lookup, the
    // same exclusion `w-[520px]` already has there, and that file's `selector()`
    // escapes only . : / [ ] so a candidate containing parens and commas would
    // report "generates no CSS" for a class that generates fine. See docs/TODO.md
    // for the token question and the one-line fix if a later ticket wants these
    // listed.
    <div className="bg-surface-card absolute top-75 left-25 flex w-90 flex-col gap-3.5 rounded-xl px-6.5 pt-6 pb-6.5 shadow-[0px_24px_50px_0px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between">
        {/* A <p>, not an <h2>. It is fabricated and outside the document outline.
            aria-hidden keeps it out of the heading rotor either way, but a heading
            here would be wrong the day somebody removes that. */}
        <p className="text-label-m text-text-secondary">October budget</p>
        <Tag label="On track" tone="green" />
      </div>

      <div className="flex items-baseline gap-1.5">
        <p className="text-display-l text-text-primary">{SAMPLE_BUDGET.spentLabel}</p>
        <p className="text-body-m text-text-tertiary">{SAMPLE_BUDGET.budgetLabel}</p>
      </div>

      {/* ProgressBar's props are an exclusive union, so a name is mandatory at
          compile time even here, where the whole subtree is hidden and nothing can
          ever announce it. `label` rather than `labelledBy`: pointing at an id on
          the title above would mean carrying an id that can never be read.

          Real numbers rather than the 150/240 the Figma instance happens to draw,
          which is only the component's own default fill. */}
      <ProgressBar
        value={SAMPLE_BUDGET.spent}
        max={SAMPLE_BUDGET.budget}
        label="October budget"
        valueText={`${SAMPLE_BUDGET.spentLabel} ${SAMPLE_BUDGET.budgetLabel}`}
      />

      <p className="text-label-m text-text-secondary">{SAMPLE_BUDGET.remaining}</p>
    </div>
  );
}

function SampleChip({ label, amount, colour, position }: (typeof SAMPLE_CHIPS)[number]) {
  return (
    // gap-2.25 is 9px, and pl-3/pr-3.5 the asymmetric 12/14 Figma draws. The
    // shadow is the second arbitrary literal; see the note on the card above.
    <div
      className={`bg-surface-card absolute flex items-center gap-2.25 rounded-full py-2.5 pr-3.5 pl-3 shadow-[0px_10px_24px_0px_rgba(0,0,0,0.25)] ${position}`}
    >
      <span className={`size-2.5 shrink-0 rounded-full ${CATEGORY_TILE[colour]}`} />
      <p className="text-strong-s text-text-primary">{label}</p>
      <p className="text-label-s text-text-tertiary">{amount}</p>
    </div>
  );
}

export function DecorativePanel() {
  return (
    // aria-hidden on the whole panel, which is load-bearing rather than tidy.
    // ui/ProgressBar publishes role="progressbar" with aria-valuenow, so unhidden
    // this announces a real progressbar reporting a real-sounding 62% of a budget
    // that is not the reader's, and ui/Tag announces "On track" as if it were a
    // statement about their finances. Every figure in here is invented and stays
    // invented, which is a stronger case than PLACEHOLDER_PROFILE has.
    //
    // Note aria-hidden on an ancestor does NOT remove focusable descendants from
    // the tab order - the classic footgun. There are none (Tag and ProgressBar
    // render span and div), and WelcomeScreen.test.tsx pins that so a later ticket
    // cannot add one.
    //
    // A plain <div>, never an <aside>: an aria-hidden landmark is
    // self-contradictory. The runner-up, role="img" with a summarising aria-label,
    // was rejected because Figma draws no caption, so the label would be copy
    // nobody wrote.
    //
    // w-140 is the designed 560px and needs shrink-0 so the flex row cannot
    // compress it. overflow-hidden is what clips the two circles, and it belongs
    // here rather than on the page so the frame keeps its no-scroll promise.
    <div aria-hidden="true" className="bg-surface-ink relative w-140 shrink-0 overflow-hidden">
      {/* Two washes of accent, bleeding off two edges. The exported SVGs were
          inspected: plain solid circles, no blur, no gradient, so a div with a
          background and an opacity is the same paint rather than a redraw - do not
          reach for `blur-*` from a screenshot.

          Figma fills both `#4F45E6`, one hex digit off --color-brand-accent
          (#4F46E5) and unbound to any variable, i.e. a slip. We ship the token:
          `bg-[#4F45E6]` would be the first raw colour in the whole frontend and
          would defeat the point of clearing Tailwind's palette, and the difference
          is one unit of green under 28% opacity over #101720. Recorded in
          docs/TODO.md so the designer can bind the layer.

          size-130 is 520px at left 180 / top -140; size-90 is 360px at left -120 /
          top 640. Figma reports those as the bounding box's top-left, so they read
          straight across.

          DOM order is the z-order: circles, then the card, then the chips, all in
          one stacking context, so later siblings paint on top. No z-index is
          needed and adding one is the reflex fix if somebody reorders these. */}
      <div className="bg-brand-accent absolute size-130 rounded-full opacity-28 left-45 -top-35" />
      <div className="bg-brand-accent absolute size-90 rounded-full opacity-18 -left-30 top-160" />

      <SampleBudgetCard />

      {SAMPLE_CHIPS.map((chip) => (
        <SampleChip key={chip.label} {...chip} />
      ))}
    </div>
  );
}
