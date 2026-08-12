// The brand lockup: a rounded tile carrying a `$`, then "PENDIFICO" - which reads "SPENDIFICO",
// because the `$` is doing double duty as the S. One component for every place the brand appears,
// as of PET-79.
//
// **It replaced three hand-copied lockups, not two.** This file and `ui/Sidebar.tsx` each drew
// their own tile-plus-wordmark, which is the pair PET-79's plan named and this file's old comment
// predicted ("it needs a size and a tone pair"); `(app)/layout.tsx`'s mobile drawer bar drew a
// third, wordmark-only copy that the plan missed. Five `font-display` call sites collapse into
// this one component.
//
// **The glyph is text rather than the supplied SVG, and that reverses the plan's own first
// answer.** The artwork is set in a typeface - IM Fell English SC - so the letterforms are not
// bespoke and the wordmark can be real text, which retires the objection the plan was written on
// (that no font reproduces them). The favicon stays vector for the opposite reason: `app/icon.svg`
// is served as a static file and an SVG loaded as an image cannot fetch a webfont, so `<text>`
// there would render in whatever the viewer's machine happens to have.
//
// **Every size is derived from the artwork rather than chosen**, measured with `getBBox()` on the
// trimmed SVG and with the real webfont in the browser:
//
//   - the tile is a square, and its corner radius is exactly **1/6** of it (arc 16.5725 in a
//     99.4331 viewBox), which is why the radius is a percentage and not three pixel literals -
//     it then matches the artwork at every size on its own, where `rounded-lg` matched it at none
//   - the `$` ink height is **0.7810** of the tile, and Crimson Pro's `$` ink is **0.8200** per em
//     at `font-bold`, so its font-size is `0.7810 x tile / 0.8200`
//   - the wordmark's cap height is **0.6146** of the tile, and Crimson Pro's cap is **0.5800**
//     per em, so its font-size is `0.6146 x tile / 0.5800`
//
// **Only the largest size can carry the wordmark ratio, and that is a container constraint rather
// than a preference.** "PENDIFICO" is 4.98 times its own font-size wide, so at the artwork's
// proportions a 36px tile needs 238px - and the sidebar's `w-64` column leaves **216px** after its
// padding. Measured, not estimated. So `lg` is artwork-faithful (249.7px, on a 520px card) while
// `md` and `sm` reduce the wordmark alone and keep the `$` ratio exact, because the `$` is inside
// the tile and the tile always has room. A reader comparing the sidebar against the artwork should
// expect the wordmark to be smaller there, deliberately.
//
// **The accessible name is explicit, and it has to be.** The visible text is "PENDIFICO" with a
// `$` for the S, which a screen reader renders as "dollar P E N D I F I C O" - so both visible
// parts are `aria-hidden` and one `sr-only` span carries "Spendifico". `Sidebar.test.tsx` pins
// that string, which is what would otherwise have caught this as a regression rather than a
// design.
//
// **The wordmark stays "Spendifico".** The design file still says "Expensa" and `docs/TODO.md`
// records the divergence; nothing here reverts toward it.

/**
 * The three sizes, as complete literal class strings per token.
 *
 * The variant-map convention every such map in this repo follows: Tailwind's scanner reads this
 * file as raw text, so an interpolated `size-${n}` is found by nobody and compiles to nothing.
 * The arbitrary `text-[...]` values are geometry rather than type scale - the same call the old
 * version of this file made about `size-9.5` being "geometry rather than styling" - so they are
 * deliberately not steps on Tailwind's type ramp.
 */
const LOCKUP_SIZE = {
  /** Access screens: a 38px tile at the artwork's own proportions. 249.7px wide. */
  lg: {
    tile: 'size-9.5',
    gap: 'gap-2.75',
    glyph: 'text-[2.262rem]',
    word: 'text-[2.517rem]',
  },
  /** The sidebar: a 36px tile with the wordmark reduced to fit a 216px column. 197.5px wide. */
  md: {
    tile: 'size-9',
    gap: 'gap-3',
    glyph: 'text-[2.143rem]',
    word: 'text-[1.875rem]',
  },
  /** The mobile drawer bar: a 32px tile, the wordmark reduced likewise. 171.6px wide. */
  sm: {
    tile: 'size-8',
    gap: 'gap-2.5',
    glyph: 'text-[1.905rem]',
    word: 'text-[1.625rem]',
  },
} as const satisfies Record<string, { tile: string; gap: string; glyph: string; word: string }>;

export type LogoLockupSize = keyof typeof LOCKUP_SIZE;

/**
 * The two colour treatments.
 *
 * **`brand` is the product owner's mapping, chosen against the measurement rather than in
 * ignorance of it.** A `primary` tile carrying a `warning` `$` measures **1.37:1** in `abyss` and
 * clears 3:1 only in stock `light`; four alternatives that pass everywhere were drawn and priced
 * in `docs/explainers/logo-tile-options-preview.html`, and this was picked anyway. That page is
 * the record of what it was chosen over, and the reason it is defensible is that the mark is
 * decorative: the `sr-only` name carries the brand, so the glyph conveys nothing a reader loses.
 *
 * `onDark` exists for a surface that is already `neutral` and is currently unused by the app; it
 * is here because `DecorativePanel` is the one place a lockup could land on such a ground, and a
 * `tone` with one legal value is what the old version of this file refused to add.
 */
const LOCKUP_TONE = {
  brand: { tile: 'bg-primary', glyph: 'text-warning', word: 'text-base-content' },
  onDark: { tile: 'bg-primary', glyph: 'text-warning', word: 'text-neutral-content' },
} as const satisfies Record<string, { tile: string; glyph: string; word: string }>;

export type LogoLockupTone = keyof typeof LOCKUP_TONE;

type LogoLockupProps = {
  /** Defaults to `lg`, which is what the five access screens draw. */
  size?: LogoLockupSize;
  /** Defaults to `brand`. */
  tone?: LogoLockupTone;
};

export function LogoLockup({ size = 'lg', tone = 'brand' }: LogoLockupProps) {
  const dimensions = LOCKUP_SIZE[size];
  const colours = LOCKUP_TONE[tone];

  return (
    // Not a link. Figma draws no affordance on the wordmark, and picking a destination for it is a
    // routing decision - the note `ui/Sidebar.tsx` carried before this component absorbed its copy.
    <div className={`flex items-center ${dimensions.gap}`}>
      <div
        // `rounded-[16.6667%]` rather than a radius token: the artwork's corner arc is exactly 1/6
        // of the tile, so a percentage tracks it at every size while `rounded-lg` tracked it at
        // none. And no ring: an inset `box-shadow` paints *behind* the element's content and the
        // content here is an opaque square, so a ring drawn that way is invisible - the bug that
        // hid it in the preview page until the artwork was aligned. If one is ever wanted it has
        // to composite over the tile.
        className={`${colours.tile} ${dimensions.tile} flex shrink-0 items-center justify-center rounded-[16.6667%]`}
      >
        {/* `leading-none` so the tile's height is its own rather than the glyph's line box, and
            the `$` is optically centred by the flex parent. `aria-hidden` because the sr-only
            name below carries the whole word - unhidden this announces "dollar". */}
        <span
          aria-hidden="true"
          className={`font-display ${dimensions.glyph} ${colours.glyph} leading-none font-bold`}
        >
          $
        </span>
      </div>

      {/* "PENDIFICO", not "Spendifico": the tile's `$` is the S. Hidden for the same reason, so a
          reader gets one clean brand name instead of "dollar P E N D I F I C O". */}
      <span
        aria-hidden="true"
        className={`font-display ${dimensions.word} ${colours.word} leading-none font-bold`}
      >
        PENDIFICO
      </span>

      {/* The whole of what the mark announces. `Sidebar.test.tsx` and six other suites pin this
          string, which is what makes the visible split above safe rather than a regression. */}
      <span className="sr-only">Spendifico</span>
    </div>
  );
}
