// The brand lockup: the accent tile carrying the cedi glyph, then the wordmark.
//
// Drawn identically on every one of the six access frames - 01 Welcome (node
// 41:698), 02 Setup (42:702), 03 Setup, 22 Register, 23 Log in and 24 Check your
// email - at the same 127x38 geometry each time. Welcome puts it top left; the
// other five centre it, which is the parent's business rather than this
// component's.
//
// **Why this is not in components/ui/.** That folder mirrors the nine tiles on the
// Figma Components page and is complete; the lockup is not one of them. It is not
// beside a route either, the way app/(app)/dashboard/MonthPill.tsx is, because it
// belongs to six screens rather than one. So it is the first non-ui child of
// components/, which is the third case CLAUDE.md's split-by-role paragraph allows.
//
// **Note ui/Sidebar.tsx holds a second, smaller copy of the same lockup.**
// Unifying the two is deliberately out of scope here, and it is not a refactor of
// this file - it needs a size and a tone pair, and it would drag a merged,
// pinned component through a UI ticket that has no other business in it.

/**
 * No props. A `tone` or `size` prop with one legal value each is worse than none;
 * the second variant arrives with whoever unifies this and the sidebar's copy.
 */
export function LogoLockup() {
  return (
    // gap-2.75 is 11px, the designed distance from tile to wordmark.
    <div className="flex items-center gap-2.75">
      {/* size-9.5 is the designed 38px, which is geometry rather than styling and
          so still comes from Figma. The corner does not: the frame binds it to a
          raw 11px, and PET-57 takes the theme's `rounded-lg` instead of carrying an
          off-scale literal for a value the design system never named. The brand
          tile is `primary`, which is what the accent became. */}
      <div className="bg-primary text-primary-content flex size-9.5 shrink-0 items-center justify-center rounded-lg">
        {/* U+20B5 CEDI SIGN, as drawn. A text glyph rather than a traced path,
            which is what Figma has, so it depends on Plus Jakarta Sans carrying
            it - worth an eye in Storybook, because a fallback glyph would look
            wrong here and no test can see it. Same note as ui/Sidebar. */}
        <span aria-hidden="true" className="font-display text-xl">
          ₵
        </span>
      </div>

      {/* "Spendifico", not Figma's "Expensa": the rename was decided on 2026-08-02
          and this is its most visible string. The design file is the only half
          that has not moved - swapping the logo asset is the designer's call - and
          the divergence is recorded under "The Figma file still says Expensa" in
          docs/TODO.md. Do not "correct" this back to the design.

          A <p>, not a heading. ui/Sidebar makes the same call and records why: the
          brand is not the page's own title, and putting it in the heading rotor
          would place it ahead of the screen's real h1. */}
      <p className="font-display text-xl font-bold">Spendifico</p>
    </div>
  );
}
