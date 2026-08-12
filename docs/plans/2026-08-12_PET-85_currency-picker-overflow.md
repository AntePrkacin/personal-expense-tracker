# PET-85: the currency picker overflows the viewport, and the list is why

Jira: [PET-85](https://decode.atlassian.net/browse/PET-85) · Epic:
[PET-7 Settings](https://decode.atlassian.net/browse/PET-7) · Design: frames
[02 Setup - Currency & budget](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=42-700)
and 17 Settings, neither of which draws the open panel at all - the frames show a closed select
reading "USD - $". So the panel's size is ours and always has been, which is why nothing in the
design file caught this.

Base branch: `main` at `db2312b`, PR #94's merge. Nothing to stack on: the two files this changes
are at their merged shape and no open branch is near them.

## Why

The switcher is broken, and it is broken in the way a component is broken when the world moves
underneath a comment nobody re-read.

`components/BudgetField.tsx`'s `PANEL` constant carries this, written at PET-47:

> No `max-h`/`overflow` pair, unlike that file - three currencies fit, and a scroll container for
> three rows would be furniture with nothing to do.

That was true when it was written. PET-72 then grew `SUPPORTED_CURRENCIES` from three codes to
**twenty-nine** - a real fix, closing the JPY-inflated-a-hundredfold defect by replacing
`@IsISO4217CurrencyCode()` with an allowlist of exponent-2 codes - and never came back to the panel
sized for three.

Measured in headless Chromium at 1440x900, against Storybook, on `components-budgetfield--default`
and `screens-17-settings--default`, both reporting identically:

| | measured |
| --- | --- |
| rows | 29 |
| panel height | 1024px |
| viewport height | 757px |
| overflow past the viewport | 294px |
| computed `max-height` | `none` |
| panel scrolls (`scrollHeight > clientHeight`) | no |
| last row inside the viewport | no |

The panel is a platform popover, so it is in the **top layer** and positioned against the viewport:
scrolling the page does not bring the bottom of it back. The last several currencies are painted
and unreachable by any means the user has. That is the bug, and the harness script that produced
the table is what the verification step below re-runs after the fix.

## The decision, and it is the product owner's

**Trim the offered list to EUR, USD, GBP.** Stated in the request as "leave just the first three,
remove the rest", against a screenshot of the open panel.

Two things follow that are worth separating, because they are different kinds of claim.

**As a fix for the overflow it is exact rather than incidental.** Three rows is the condition the
panel was built for and measured against, so the component needs no change at all: the comment
becomes true again instead of becoming a lie with a workaround stapled beside it.

**As a product change it settles A6.** The tech spec's assumption reads "The Currency select shows
only 'USD - \$'; the option list is unknown. Ship with USD until specified." BUD-2 and SET-3 both
draw the control and neither names an option list. This ticket is the specification, so A6 is
answered rather than amended: the list is EUR, USD, GBP, EUR first because it is the default since
PET-72.

## What is deliberately not done

**No `max-height` and no scroll container.** The rule-satisfying option is to keep twenty-nine
codes and bound the panel, and it is the one to price before reaching for the trim - it is roughly
two classes, it fixes the overflow, and it keeps every currency. It is not what was asked for, and
it is worse on its own terms once the reason for the list is read: the allowlist exists because
`toCents`/`fromCents` assume an exponent of 2, and twenty-nine two-decimal codes is not a designed
option list, it is the residue of a validation fix. A scrolling panel of twenty-nine would be an
undesigned control offering an unreviewed list. If the list ever grows back, **that** is the ticket
where the scroll container is right, and the panel comment is the thing to read first.

**No migration and no backfill.** A profile can be holding a code this removes. Nothing breaks:
`moneyFormatters` takes a `string` and falls back through `Intl` rather than throwing,
`currencySymbol` answers the bare code, and the trigger draws it once - which is exactly the
`UnofferedCurrency` story and the `CHF` case `BudgetField.test.tsx` already pins. `PATCH
/api/profile` would refuse such a code, but `toUpdateProfileBody` sends only fields that changed,
so an untouched currency is never re-submitted. There are no real users and test accounts get
purged, so there is nothing to migrate even if there were a reason to.

**No exponent table.** A genuinely wider list needs an exponent per code threaded through both
conversion functions, every `Intl` call and the amount field's hand-built grouping.
`docs/TODO.md` carries that and this ticket does not change its conclusion - only the count it is
stated against.

## What holds the two lists together

Worth stating before the checklist, because it is the whole reason this is a small change rather
than a sweep. `backend/src/common/currency.ts` is the single source: `@IsIn(SUPPORTED_CURRENCIES)`
on both DTOs publishes a real OpenAPI enum, `api:sync` carries it into
`frontend/src/types/api.d.ts`, and `lib/money.ts` derives `CurrencyCode` from that enum. Two
compile-time checks then close both directions - the `satisfies` clause rejects an offered code the
contract does not accept, and `EveryCurrencyCodeIsOffered` fails the build when the contract carries
a code the picker does not offer. So the failure mode of doing this wrong is a red build, not a
shipped mismatch, **provided `api:sync` is actually run**. Skipping it degrades `CurrencyCode` to
`string` and both proofs quietly stop proving anything.

A sweep confirmed the twenty-six dropped codes appear in **exactly two places**, the two lists
themselves: `rg -no "'(AED|AUD|…|ZAR)'" frontend/src backend/src backend/test docs` returns only
`backend/src/common/currency.ts` and `frontend/src/lib/money.ts`. No fixture, no test and no
showcase seed names one.

## Tasks

- [ ] Trim `SUPPORTED_CURRENCIES` in `backend/src/common/currency.ts` to `EUR`, `USD`, `GBP`, and
      correct the docblock's ordering paragraph, which describes "then the rest alphabetically" - a
      sentence about a tail that no longer exists. The exponent-2 selection rule stays verbatim: it
      is why the list may not grow carelessly, and it is now the only thing keeping that discipline.
- [ ] Run `npm run api:sync` from the repo root and commit `backend/openapi.json` and
      `frontend/src/types/api.d.ts` together. Read the diff rather than trusting it: the expected
      change is the `currency` enum on `UpdateProfileDto`, `ProfileResponseDto` and `RegisterDto`
      going from 29 members to 3, and nothing else anywhere.
- [ ] Trim `SUPPORTED_CURRENCIES` in `frontend/src/lib/money.ts` to the same three, and correct the
      docblock. Two sentences there are about to become wrong rather than merely dated: "the pair of
      checks below fails the build in both mismatch directions" stays true, but the `AssertNever`
      comment's "a thirtieth code added to the backend's allowlist" needs its number, and the
      paragraph explaining why the first three lead needs to stop describing them as the first three
      of a longer list.
- [ ] Update `frontend/src/lib/money.test.ts`. The exponent-2 exclusion case and the
      duplicate/name/symbol cases hold unchanged and are worth keeping - they are the runtime half of
      the discipline above. The `slice(0, 3)` case becomes an assertion about the whole list, so it
      should say so rather than slicing a list of three.
- [ ] Update `frontend/src/components/BudgetField.tsx`'s `PANEL` comment. It is the one piece of
      prose in this change that was **correct when written, then falsified by a different ticket, and
      is about to become correct again** - so it gains a sentence recording that round trip, because
      the next person to grow the list needs to meet this comment rather than rediscover the
      measurement.
- [ ] Update `frontend/src/components/BudgetField.stories.tsx`. `UnofferedCurrency`'s docblock says
      the state is "reachable because the backend validates `@IsISO4217CurrencyCode()`", which PET-72
      already made false; the honest version is that a profile can hold a code the allowlist used to
      carry. Its closing "the panel still offers the three" becomes true again.
- [ ] Check `frontend/src/components/BudgetField.test.tsx`'s two unoffered-code cases. `CHF` was an
      offered code with `symbol: 'CHF'` and is now an unoffered one, so the "never prints the code
      twice" case still passes by a **different route** than the comment describes - it needs the
      comment corrected, or it and the `JPY` case beside it need distinguishing, since they are about
      to test one thing twice.
- [ ] Correct the `docs/TODO.md` PET-72 deferral. Its conclusion is untouched; what changes is that
      it is now stated against a list of three, and the wider-list entry should say plainly that the
      list was narrowed by product decision rather than leaving a reader to infer the allowlist
      shrank for a technical reason.
- [ ] Sweep the authority files for counts and claims about this list, and change only what is
      wrong. `backend/CLAUDE.md` says the list "is that file's to count", which is the pattern
      working and needs nothing. `frontend/CLAUDE.md` describes "a live `USD`/`EUR`/`GBP` picker",
      which becomes true again. Record PET-85 in root `CLAUDE.md` per the repo's convention.
- [ ] Gates, one suite per call with `--maxWorkers` capped: `npm run build` and `npm run lint` in
      both apps, `npx tsc --noEmit` in `frontend/` (the build does not reach test files, and this
      change edits a test that constructs the list by hand), `npm test` in `frontend/`, and the
      backend e2e suite for the `@IsIn` behaviour.
- [ ] Add the AC4 e2e case: `PATCH /api/profile` with `CHF` is a 400. `profile.e2e-spec.ts` already
      has the table of rejected codes (`XYZ`, `EU`, `JPY`, `KWD`) and this is one row in it - the row
      that pins "a code this app accepted yesterday is refused today", which is the only assertion in
      the suite that would catch the trim being reverted by accident.
- [ ] Re-run the browser walk that produced the table above, in **both** Expensa themes via
      `Emulation.setEmulatedMedia`, and record the numbers in the PR. The check is not "does it look
      fine": it is panel bottom inside the viewport, last row's rect fully visible, and the row count
      equal to 3. The harness must be **seen to fail** against the pre-fix list in the same run -
      clone the panel, put twenty-nine rows back, measure - because a check that has never failed is
      not evidence.

## Open questions for the review

1. **EUR, USD, GBP is three of the twenty-nine. Is it the right three?** It is what the request
   named and what PET-47 shipped, read off the Claude Design system's `ONBOARDING_CURRENCIES`. This
   is a Croatian project; `HRK` is gone to the euro so EUR is genuinely correct for the home market,
   but if the demo audience wants a regional code (`BAM`, `RSD`) the trim is the moment to say so,
   not later.
2. **Should the panel gain the `max-height`/scroll pair anyway, as a guard?** Argued against above,
   and the argument is that furniture with nothing to do is how the last comment came to be wrong.
   The counter-argument is real: it makes the next list growth a non-event. Cheap either way, and it
   is a taste call rather than a technical one.
3. **A6 is being answered by the product owner rather than by the designer.** The ticket carries
   `design-review` and joins A29's list. Worth confirming that is the intended route, since the same
   question - who settles an assumption the design file left open - came up on PET-84's A39 and was
   answered the same way.
