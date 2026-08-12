import { Crimson_Pro, Inter } from 'next/font/google';

// The two project typefaces. Both are variable fonts, so a single request covers every weight
// the app uses without enumerating them.
//
// **Crimson Pro replaced Plus Jakarta Sans as the display face at PET-79, and Inter stayed.**
// That ticket's typography audit is the authority for why; the short version is two constraints
// that a side-by-side comparison alone would have missed, plus one that was the brief.
//
// A display face here needs **real weights**, because 28 of the 29 `font-display` call sites pair
// it with `font-bold` or `font-semibold` - a single-weight family gets synthesized bold at every
// one of them. That is what ruled out the logo artwork's own IM Fell English SC, which has one
// weight and renders lowercase as small caps besides, so "Dashboard" would have read "Dᴀsʜʙᴏᴀʀᴅ".
// Crimson Pro has eight, 200 to 900.
//
// A body face needs a **`tnum` feature**, because six call sites depend on `tabular-nums` and the
// class is inert without one - `TransactionRow` and `BudgetField` each say why in their own
// comments. Quicksand, the product owner's presentation body face, has none, and neither do
// Nunito, Source Sans 3 or IBM Plex Sans. Keeping Inter sidesteps it. Crimson Pro carries `tnum`
// too, which matters because one heading in this app *is* a number: the transaction detail
// amount is `font-display text-4xl font-bold tabular-nums`.
//
// And Crimson Pro is the **least dense** of the eight faces measured, `cap/em` 0.5732, which was
// the brief: the most air around its capitals. `docs/explainers/generators/font-metrics.json`
// holds every figure, measured from the font binaries rather than eyeballed, and
// `docs/explainers/font-pairing-review.html` draws all fourteen candidates at matched cap height.
//
// **That lightness has one mechanical cost and it is not optional.** Crimson Pro's caps are 76.9%
// the height of Plus Jakarta Sans's at the same font-size (0.5732 against 0.7450), so every
// heading would read about a quarter smaller if the sizes were left alone. Matching them
// optically means multiplying by 1.300, which PET-79 did across 25 call sites - and **not
// uniformly one step**, because Tailwind's scale is not geometric: it steps 2px at a time up to
// `text-xl` (14 / 16 / 18 / 20) and widens after it (24 / 30 / 36 / 48). So x1.3 clears a whole
// step below `text-xl` and less than one above it: **every size under `text-xl` moves two steps,
// and `text-xl` and up move one.** Four call sites are in the first group - one `text-base` ->
// `text-xl` in `(app)/AddTransactionModal.tsx`, three `text-lg` -> `text-2xl`.
//
// **A code review of PET-79 corrected this paragraph, and the original error is the instructive
// part.** It said `text-lg` alone moved two "where the rest move one", which is wrong twice: it
// named one size where three qualify (`text-sm` too, though no `font-display` site uses it), and
// it presented a property of the *scale* as a quirk of one value. It also sent the reader to a
// table in `frontend/CLAUDE.md` that does not exist and never did. The rule above is the whole of
// it, and `docs/explainers/generators/font-metrics.json` is the only file with figures in it.
//
// These expose CSS variables rather than classNames because `globals.css` maps them onto the
// `--font-display` / `--font-sans` theme tokens. This lives in its own module rather than in
// `layout.tsx` so the Storybook preview can import the same loaders and apply the identical
// variable classes. The variables must land on `<html>`, since that is where `:root` resolves.

export const crimsonPro = Crimson_Pro({
  subsets: ['latin'],
  variable: '--font-crimson-pro',
  display: 'swap',
});

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});
