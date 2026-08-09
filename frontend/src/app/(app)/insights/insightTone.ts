import { CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';

import type { InsightCard } from '@/lib/insights';

// How a card's tone becomes a colour and a glyph.
//
// **The names invert against daisyUI's, twice, and a name-to-name map compiles cleanly.**
// INS-3 draws four tones by colour - warning red, positive green, info blue, neutral amber -
// and the backend publishes them by name. `warning` therefore has to render as daisyUI's
// **`error`** and `neutral` as daisyUI's **`warning`**, because "the amber one" is the
// backend's `neutral` and "the red one" is its `warning`. Writing `text-warning` for a
// `warning` card builds, renders amber, and is wrong.
//
// **The values are whole class strings, never interpolated.** Tailwind's scanner reads source
// as raw text, so a `text-${tone}` compiles to nothing at all with no build error -
// `frontend/CLAUDE.md:82` names `ui/categoryColour.ts` as the pattern for this, and these maps
// are the same shape.
//
// **`info` is not a key, and a stored `info` still has to render.** PET-42-43-44 retired that
// tone with the projection card that produced it, so the contract's enum no longer publishes
// it - but `insights.tone` is a plain text column with no CHECK constraint, so every set
// generated before the cut still holds one on disk. The write-path trigger replaces such a set
// on the account's next transaction; until then this file is what stands between a stale row
// and a card rendering with no colour at all. Hence `toneStyle` below rather than a bare index,
// and hence its lookup being a guarded one rather than a type assertion.

/** The tones the contract publishes. An exhaustiveness proof, like `CATEGORY_TILE`. */
type InsightTone = InsightCard['tone'];

type ToneStyle = {
  /**
   * The circle behind the glyph: a **solid** semantic background with its `-content` pair.
   *
   * **Not the `bg-error/10 text-error` tint this shipped as first, which failed in light and
   * passed in dark.** Measured in headless Chromium, composited over the card: the
   * full-strength glyph on a 10% tint is **2.864:1** for `error`, **1.959:1** for `success` and
   * **1.763:1** for `neutral`'s amber - all three under the 3:1 non-text bar, and all three
   * comfortably over it in dark (5.5, 8.1, 9.0), which is exactly how it would have survived a
   * review done in one theme. The `-content` pairing measures **5.483**, **5.122** and
   * **5.245** and is theme-stable, because daisyUI puts each `-content` at the opposite end of
   * the lightness range from its base.
   *
   * This is the same shape `ui/categoryColour.ts`'s `CATEGORY_TILE` uses for the same reason,
   * and the same mistake `backend/CLAUDE.md` records for `warning-content`: a semantic token is
   * theme-aware, which is not the same as legible, and the only way to know is to measure it
   * against the surface behind it.
   *
   * **The surface to measure against is the circle, not the card.** The circle's own fill
   * measures 2.864:1 against the card in light, which is the property every `CATEGORY_TILE`
   * already has - `COLOUR_CONTRAST` records that only `primary` and `secondary` clear 3:1
   * against the card in both themes - and it is the container rather than the graphic. What
   * has to be legible is the glyph on the circle, and that is the 5.483 above.
   */
  circle: string;
  /** The glyph itself. */
  icon: LucideIcon;
  /**
   * What a screen reader hears in place of the colour.
   *
   * INS-3 carries the tone in the icon's hue and nowhere else, which is the same
   * colour-alone failure PET-22's trend chart paid for: the accent and the muted state each
   * needed naming in text. A card's title is not enough - "Transport is down 22%" reads the
   * same whether the design called it good news or bad.
   */
  label: string;
};

/**
 * Tone to appearance, with the daisyUI inversion applied once.
 *
 * `Record<InsightTone, ToneStyle>` rather than a partial map, so narrowing or widening the
 * contract's enum fails this build until the map catches up.
 */
const TONE_STYLE: Record<InsightTone, ToneStyle> = {
  warning: {
    circle: 'bg-error text-error-content',
    icon: TriangleAlert,
    label: 'Warning',
  },
  positive: {
    circle: 'bg-success text-success-content',
    icon: CircleCheck,
    label: 'Good news',
  },
  neutral: {
    circle: 'bg-warning text-warning-content',
    icon: Info,
    label: 'Worth a look',
  },
};

/**
 * The fallback for a tone the contract no longer declares.
 *
 * Deliberately the neutral treatment rather than an invented fifth one: a card carrying a
 * retired `info` is ordinary content that is merely older than the cut, and drawing attention
 * to it would tell the user something about our schema rather than about their spending. It is
 * also why this is not `TONE_STYLE.neutral` reached by index - a future map with no `neutral`
 * key should fail the build here rather than at runtime.
 */
const UNKNOWN_TONE: ToneStyle = TONE_STYLE.neutral;

/**
 * The appearance for a stored tone, whatever it turns out to be.
 *
 * Takes `string` rather than `InsightTone`, which is the whole point: the value arrives from a
 * column with no constraint on it, and `cardsFor` casts it unchecked backend-side, so typing
 * this parameter to the union would be asserting something no layer actually enforces.
 * `Object.hasOwn` rather than a truthiness check, the guard `categoryTileClass` uses, so a
 * tone named `toString` cannot borrow a prototype method.
 */
export function toneStyle(tone: string): ToneStyle {
  return Object.hasOwn(TONE_STYLE, tone) ? TONE_STYLE[tone as InsightTone] : UNKNOWN_TONE;
}
