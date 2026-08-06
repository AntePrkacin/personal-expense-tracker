import { Search } from 'lucide-react';

// The Transactions header's search field (Figma node 26:142).
//
// Note this is what 06 Transactions draws where 04 Dashboard draws the month
// select - the two screens do not share a right-hand control. PET-19's AC3 says
// the month select appears on both; TRN-1 and the frame itself disagree, and
// they win.
//
// **Real as of PET-29, and still a Server Component.** It was inert for three tickets
// because there was no list to filter, and this file's own note said turning it real was
// "a <div> becoming an <input> plus the state that owns the query". That is exactly what
// happened, and the state deliberately did not land here: `TransactionSearch.tsx` beside
// it holds the value, the debounce and the router, and renders this.
//
// **The split is not tidiness, and the constraint is a test.** `PageHeader.stories.tsx`
// imports this file, and `(app)/shell.stories.test.tsx` renders every Shell story under
// Jest with no router mocked - that file records outright that a component whose only job
// is reading the router must not get a Shell story. A `useRouter` in here would break
// that suite from a file the suite is not about. So this stays presentational and takes
// its handlers as props, which is the rule `frontend/CLAUDE.md` states for `Button`,
// `Input` and `Select`: a client component that imports one pulls it into the bundle on
// its own.
//
// **Every new prop is optional**, so the existing header story still renders it with a
// placeholder alone - uncontrolled, with no React warning about a value without an
// onChange.

/**
 * Controlled or uncontrolled, and never half of either.
 *
 * An exclusive union, the technique `ui/Button` uses for `href` versus `onClick` and
 * `CheckEmailScreen` for its resend action. A `value` with no `onChange` is a React warning at
 * runtime and a field the user cannot type in; the `never`s make it a build error instead.
 * `npm run build` is the gate that rejects it - note it does **not** read `*.test.tsx`, so
 * `npx tsc --noEmit` is what catches a test constructing the impossible pair by hand.
 */
type SearchPillProps = { placeholder: string } & (
  | {
      value: string;
      onChange: (value: string) => void;
      onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    }
  | { value?: never; onChange?: never; onKeyDown?: never }
);

export function SearchPill({ placeholder, value, onChange, onKeyDown }: SearchPillProps) {
  return (
    // daisyUI's `input` class on a wrapper rather than on the <input> itself: the
    // magnifier sits inside the field, so the border, background, focus-within ring
    // and placeholder treatment all come from the theme via the wrapper and the
    // inner control stays bare - the documented daisyUI shape for an input with an
    // icon. A <label>, so clicking the glyph focuses the input with no handler.
    // `text-sm` matches the month pill beside it in the header.
    <label className="input flex w-fit items-center gap-2 text-sm">
      <Search className="size-4 shrink-0" aria-hidden="true" />

      {/* `type="text"`, not `type="search"`: Chrome and Safari draw their own cancel
          button on a search input, which this frame does not, and the `searchbox`
          role buys nothing here. `aria-label` rather than a visible label because
          the design has none, and the placeholder alone is not an accessible name -
          it disappears the moment somebody types.

          No padding and no border of its own: the wrapper carries both, which is
          the opposite of the field components' rule and correct here because this
          box has no chevron or prefix layered over it, so no part of it is a dead
          zone.

          `w-33` is the frame's own 132px - the 182px box less the 36px the glyph
          and its gap occupy and the 14px of right padding - and it is fixed rather
          than `flex-1` because the header lays this out beside the Add transaction
          button with no column to fill. */}
      <input
        type="text"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={onChange && ((event) => onChange(event.target.value))}
        onKeyDown={onKeyDown}
        className="w-33"
      />
    </label>
  );
}
