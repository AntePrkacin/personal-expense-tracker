# PET-78 — Dashboard UI/UX fixups

Branch `fix/PET-78-dashboard-ui-ux-fixups`, cut from `main` at `e6cef17`. Jira:
[PET-78](https://decode.atlassian.net/browse/PET-78), parented to PET-3 (Dashboard).

## Context

PET-76 collected this class of defect on the AI Assistant screens and held a hard boundary: "a fixup
found on any other screen gets its own ticket, not an appendix here". This is that ticket for the
**Dashboard**, and the boundary holds again in the same direction - a defect found on Transactions,
Settings or the assistant is a third ticket rather than a third round here.

**The scope is `/dashboard` and nothing else** - the summary banner, the monthly budget card and its
stats row, the weekly trend chart, the spending-by-category donut, the recent transactions card, the
two insight cards PET-73 moved here, and the period select PET-72 made real.

**This plan is written incrementally, one item at a time, by design.** The product owner is walking
the finished screen with real data and reporting each defect as it is found; each one is written up
here with its measured root cause before it is fixed, rather than the whole list being enumerated up
front. That is a departure from every plan in this folder and it is deliberate: the alternative is
either a plan that lags the work or a batch of fixes nobody wrote down. The task checklist below
grows with the list, and the Jira description is rewritten from it once the list closes.

The account being walked is the local showcase seed - `dummy@spendifico.eu`, 2,220 transactions
across 36 months, 13 categories, reset and re-seeded on 2026-08-12 - so every figure on the screen
is real and every defect below is reachable on ordinary data.

## The fixups

### 1. The donut's centre readout is pushed out of the hole

`(app)/dashboard/CategoryDonut.tsx` draws the period's total over the ring's hole: an absolutely
positioned overlay, `absolute inset-0 flex flex-col items-center justify-center`, holding the amount
and the caption "Total spent". On screen the amount sits **on the top arc** and the caption sits near
the ring's centre, roughly 96px apart, in both the populated and the empty branch.

**The cause is `.card-body p { flex-grow: 1 }`, which daisyUI ships and this repo has already paid
for once.** `frontend/CLAUDE.md`'s Where daisyUI and Tailwind fight records it against a card
_footer_ whose `justify-between` did nothing - two `<p>` children both stretching, no free space left
to distribute - and notes in passing that every row beside it escaped only because its right-hand
child is a `<span>` or an `<a>`, which the selector does not match. Both children of this overlay are
`<p>`, and the overlay is a `flex-col` **inside** `.card-body`, so the rule applies on the block axis
here: each paragraph grows to half the overlay's height and renders its text at the top of its own
grown box.

**Measured in headless Chromium at 1440x1024**, story `shell-spending-by-category--five-categories`,
with the plot box 192px tall and the hole radius 67.2px:

- `flexGrow` computes to **`1`** on both paragraphs - read off the browser, not off the stylesheet
- the amount's box is **104px** tall and the caption's **88px**, together exactly the overlay's 192px
- the amount's box centre is at y=116 against a hole centre of y=160, so it sits **44px above centre**
- `amountDistFromCentre + height / 2 > innerR`, so the amount **does not fit inside the hole** at all
- the empty branch (`--empty`, 184px plot, 64.4px hole) is the same defect at **42px**

**The deceptive part is that the pair as a group is centred perfectly**: the midpoint between the
first line's top and the last line's bottom measures y=160 against a hole centre of y=160, an offset
of **0**. Nothing is off-centre. The two lines are shoved 96px apart by a rule neither of them names,
which is why this reads as a positioning mystery rather than as a flex defect.

**The fix is to stop the two lines being `<p>`**, in both branches: they become `<span>`s, which the
selector does not match, and flex blockifies them so they still stack. Three alternatives were
considered and rejected.

- **`grow-0` on each line does not work**, and this is the trap the existing entry already documents:
  daisyUI's selector is (0,1,1) against a utility's (0,1,0), so it wins on specificity rather than on
  layer order. Measured in Chrome on the footer case, `flex-grow` still computed to `1` with `grow-0`
  present.
- **`[&_p]:grow-0` on the overlay** lands at the same (0,1,1) as daisyUI's own rule, so it is decided
  by emission order - the first entry in that same list, arrived at from a new direction.
- **Wrapping both paragraphs in a `<div>`** works, because `flex-grow` is inert on the children of a
  block container, and it keeps the `<p>` elements. Rejected as the larger change: it adds a node and
  needs `text-center` back on the wrapper, since the paragraphs would no longer be flex items being
  centred individually by `items-center`.

Neither line is prose, so `<span>` is the honester element for a figure and its caption anyway. The
suite needs no change: `CategoryDonut.test.tsx` queries both by text and reaches for
`.closest('[aria-hidden="true"]')`, neither of which names an element type - which is also what makes
this defect invisible to it, along with jsdom running no layout at all.

**What this does not change.** The readout stays **outside** the `aria-hidden` wrapper around the
ring, which is PET-23's review finding and the reason the extra wrapper exists at all; the empty
branch keeps printing `formatWhole(spent)` rather than a literal, for the dangling-category race
PET-26 records; and the ring, the legend and every figure are untouched.

**One thing to check rather than assume, and it is why the walk re-runs on the app and not only on
Storybook**: the story renders the card at the full 1392px width, so the ring's plot box is wide and
short. On the real Dashboard the donut sits in the narrow column. The vertical arithmetic is what the
defect is made of and it does not depend on width, but the post-fix check is measured on both
surfaces rather than argued from one.

### 2. The donut's tooltip lands on the centre readout, so it goes

Hovering a slice renders Recharts' tooltip at the cursor, and the cursor is inside a 192px box whose
middle is the centre readout - so on most slices the tooltip prints the category, its amount and its
percentage directly over "€3,898 / Total spent", both strings illegible. Reported with a screenshot
that shows exactly that.

**The tooltip is deleted rather than repositioned, and the argument for that was already written in
the file.** `CategoryDonut.tsx`'s own comment says the legend "is a strict **superset** of the hover
tooltip, naming every slice with its amount and its percentage in real text, so a pointer-only
tooltip adds convenience rather than information" - which is also the reason the ring may be
`aria-hidden` at all. Take that seriously and the tooltip carries **nothing** the card does not
already state permanently. What it does carry is the one thing the legend cannot: which row belongs
to the arc under the pointer. So that association is what replaces it.

**Hover is bidirectional and emphasises both ends.** Hovering an arc outlines that arc and highlights
its legend row; hovering a legend row outlines its arc. That is strictly more than the tooltip did -
it answers "where is Groceries in the ring", which no tooltip can - and it is worth more here than on
most donuts, because `ui/categoryColour.ts` documents **two deliberately-close colour pairs** in the
palette, so tracing a hue back to a legend row by eye is exactly the task this card is worst at.

Three alternatives were considered. **Pushing the tooltip radially outward** keeps the name at the
cursor and needs `allowEscapeViewBox` plus per-slice angle arithmetic, with a tooltip escaping a
192px box near the card's edge to keep on screen. **Pinning it at one fixed spot** cannot overlap and
is the smallest change, but a tooltip that does not follow the pointer is a readout, and it adds a
line of chrome that is empty most of the time. Both were rejected in favour of deleting a component
whose information was redundant. The third, dimming the non-active slices instead of outlining the
active one, is rejected for a reason this repo has already paid for twice: a translucent fill has to
be composited and measured before anything can be said about it, and a dimmed small slice is exactly
the mark that disappears. The active slice takes a 2px `base-content` **stroke** instead, which
introduces no alpha and so has no contrast argument to have.

**The state has to live above both the ring and the legend, and that is the only structural change.**
`CategoryRing` is the card's one client boundary today and the legend is server-rendered HTML, which
`CategoryDonut.tsx` calls out as deliberate. So `dashboard/CategoryHover.tsx` is a provider holding
one `activeId`, wrapping the ring and the legend both - `transactions/FilterNavigation.tsx`'s shape
exactly, and for its stated reason: two client pieces on opposite sides of a server-rendered boundary
need one owner. `useCategoryHover()` **throws** outside it, the call `useFilterNavigation` and
`useAddTransaction` both make, because a highlight that quietly stops working looks like a slow
render rather than a bug.

**The legend's text stays server-rendered, which is why `LegendRow` takes children.** A context
provider renders no DOM node, so `card-body`'s `gap-4` still applies to the heading, the ring and the
`<ul>` exactly as before; and the only client-owned thing in a row is the `<li>`'s own class and its
two pointer handlers, with the dot, the name, the amount and the percentage passed in as
server-rendered children. Making the whole legend a Client Component was the obvious shape and
concedes something for nothing: the card would render as a bare ring before hydration, on the one
surface whose text is the ring's accessible equivalent.

**No tab stops and no ARIA.** `CategoryDonut.test.tsx` pins
`[tabindex]:not([tabindex="-1"])` at zero on this card, and the highlight is a pointer-only
convenience conveying nothing a legend row does not already say in text - so making rows focusable
would promise a keyboard contract nothing implements, which this repo has declined five times
already. That the affordance is genuinely redundant is the same fact that let the tooltip go.

**The row's flow height must not change.** A background band needs padding, and padding on thirteen
rows would make the card taller - so the band is `-mx-2 -my-0.5 px-2 py-0.5`, where the negative
margins absorb the padding (flex has no margin collapsing) and the painted background is 4px taller
than the text box while the laid-out row is the same size it was. That is measured rather than
asserted.

Two consequences outside the three files. `CategoryRing` stops calling `useMoney()` - it was the
tooltip's - so `PreferencesProvider.tsx`'s comment listing it as a consumer goes stale and the donut
stories' `PreferencesProvider` wrapper stops being load-bearing. And two story docblocks tell the
reader to hover for a tooltip, which they must stop saying.

### 3. The trend tooltip drops its amount and keeps its date range

`dashboard/TrendChart.tsx`'s `TrendTooltip` prints the bucket's date range over the bucket's total.
The total is already painted permanently above every bar by the `LabelList` two elements up - so
hovering a bar restates the one figure that was never in question, and covers the neighbouring bars
to do it. The amount goes; the range stays.

**This is item 2's test applied to a different answer, which is the point worth recording.** The
question in both cases is what the tooltip holds that the card does not already state. On the donut
the answer was *nothing* - the legend names every category with its amount and its percentage - so
the tooltip was deleted outright. Here the answer is the **date range**, which appears nowhere else
on screen: the axis says "Week 1", and only the range explains a short final bucket drawn beside
full weeks. So the same test keeps this tooltip and empties the donut's. Two opposite outcomes from
one rule is what says the rule is doing work.

**One consequence rather than a second decision: an empty range now suppresses the whole bubble.**
`weeks.ts`'s `bucketRangeLabel` answers `''` for a date it could not parse, and the existing guard
only had to avoid a blank line above the amount - the tooltip still had something to say. With the
range as the only content, an empty one would paint an empty box floating beside the bar, so
`TrendTooltip` returns `null` for it.

**The screen-reader list keeps both, and must.** `TrendCard.tsx`'s `sr-only` list names each week,
its range, its amount and its state, and it is the accessible equivalent of the **whole chart** -
the bar labels included - rather than of this bubble. Stripping the amount there would delete a
figure that no longer appears anywhere for a screen-reader user, which is the opposite of what this
item is for. `TrendCard.test.tsx`'s "names every week with its date range, its amount and its state"
pins that and is unchanged.

Nothing else moves. `TrendRow.actual` still drives the bar label and the `sr-only` line, so no type
narrows; `useMoney()` stays imported because `renderValue` uses it, though the tooltip no longer
does - the comment claiming it did is corrected in place. No test asserted the tooltip's contents,
because Recharts never activates it under jsdom, which is why this item's check is a browser one.

### 4. "of €5,000" comes back to the figure it qualifies

`dashboard/BudgetCard.tsx`'s readout is `flex items-baseline gap-2` holding the period's spend and
the budget it is measured against. On screen the budget sits hundreds of pixels to the right, near
the middle of the card, reading as an unrelated fragment rather than as the second half of
"€3,898 of €5,000".

**This is the third instance of `.card-body p { flex-grow: 1 }` in one ticket, and the first that is
the symptom `frontend/CLAUDE.md` was already written about.** Both children are `<p>`s, so each grew
to half the row and rendered its text at the left edge of its own over-wide box - putting `gap-2`
between two boxes rather than between two numbers. Measured on `/dashboard`: **231px of slack on
each child, and 238.9px between the end of "€3,898" and the start of "of €5,000"**, against the
**8px** the `gap-2` promises. Both are `<span>`s now and the measured gap is exactly 8px.

**The documented fix was the wrong one here, which is the part worth recording.** That entry says to
reach for `text-right` rather than `grow-0`, and it is right for the case it was written from - the
"days left" caption in this very card, which is *meant* to reach the card's right edge and does so
correctly today. This pair is meant to read as one sentence, so pushing the second figure to the
right edge would move it further from the first rather than closer. The rule generalises as: the
`text-align` fix relocates the text, and only works where the intended position is an edge; where
two items are meant to be **adjacent**, nothing about alignment can help and the element has to stop
being a flex item that grows.

**The sweep this plan deferred is done, because three instances is not a coincidence.** Run in the
browser rather than as a grep, since the defect is a computed value: every `<p>` inside a
`.card-body` that is a flex item with `flex-grow: 1` whose box is materially bigger than its own
text along the parent's main axis, across all six signed-in screens. **41 hits, and not one of them
is a defect** - 27 benign and 14 already compensated.

That split is the sweep's real output, and the first version of it was wrong in a way worth keeping.
It flagged all 41 as suspects, because slack alone looked like the defect; it is not. The **first**
child of a `justify-between` row grows too, and its text still sits at its own start edge, which is
exactly where it belongs - `€1,102 left` reports 260px of slack and looks perfect. So the verdict
needs the child index and the alignment as well as the slack: a later, start-aligned child pushed
away from what it qualifies is the defect, and that is what item 4 was. After the fix the sweep
reports **zero** of those on every screen, and the probe above shows it reporting one when the `<p>`s
are put back - which is what makes the zero mean anything.

Two things that sweep is not. It cannot see a screen it did not visit, and `/transactions` and
`/insights/history` have no `.card-body` at all, so their zero is an absence of cards rather than a
clean bill. And it only asks about `<p>`; the rule is `.card-body p`, so nothing else can trip it,
but a future daisyUI selector over another element would need the sweep rewritten rather than re-run.

### 5. The summary banner: four changes, one of them a deletion nobody asked to keep

Reported as four things about the Dashboard's top card, and they are independent enough to take in
turn. Two were instructions, one was a measurement, and one was a question whose answer changed the
design.

**5.1 It was invisible in the dark theme, and "not highlighted" understates it.** The card was
`bg-neutral`, daisyUI's always-dark slot. `globals.css` sets `--color-neutral` to `#101720` in
**both** Expensa themes, and the dark theme's `--color-base-200` - which paints the page canvas -
is **also** `#101720`. So the fill was byte-identical to the ground behind it, measured at exactly
**1.000:1**. Not a weak highlight: the same colour.

`ui/Sidebar.tsx` hit this in PET-74 and its comment names the cause outright - "the ink version
dissolved into the dark theme's canvas outright, because the Expensa dark canvas *is* ink". Its
answer, `bg-base-100` plus a hairline, is deliberately **not** taken here: it would make the banner
identical to the five ordinary cards around it, which fixes visibility and removes the highlight.
So the banner is **`bg-primary/20` with a `border-primary/30` hairline** - distinct from the canvas
*and* from a plain card, in both themes, in the colour the assistant link already uses. Still no
`dark:` variant and still no raw palette class; `primary` is semantic, so each theme resolves it.

Both halves carry an alpha, so both were composited and read off painted pixels. `/10` was measured
first and rejected on one number: it reads **1.003:1 against a plain `base-100` card in dark**, i.e.
it differs from an ordinary card almost entirely in hue rather than in lightness. `/20` clears the
design's own ~1.075-1.099 card-versus-canvas step on both comparisons.

| | light | dark (before) |
| --- | --- | --- |
| banner vs canvas | 1.355 | **1.234** (was 1.000) |
| border vs canvas | 1.598 | 1.420 |
| banner vs plain card | 1.456 | **1.123** (was 1.003) |
| body text vs banner | 5.505 | 7.884 |

`globals.css`'s own comment claiming "nothing in the shell paints `bg-neutral` any more" was already
wrong - this card did - and is true now.

**5.2 The eyebrow goes, and it takes a prop with it.** "✦ AUGUST 2026 SUMMARY" sat above the
headline while the page header's overline said "August 2026" and the period select beside it said
"August 2026": three statements of one fact, in three type styles, on one screen. The `overline`
prop is deleted, which also removes `UNLOCK_COPY`'s and `PENDING_COPY`'s "AI Insights" - neither
named a period, and an eyebrow whose only job is labelling the card as an AI card is what the
headline and the assistant link already do. The **skeleton keeps its eyebrow**, because
"Analyzing your spending..." is a status rather than a period label and is the only visible text
while the bars are up.

**This one gives something up, and it is recorded in `docs/TODO.md` rather than only here.** The
eyebrow was the only place the card named the period its analysis covers, and a set can outlive its
period: the read serves the latest **ready** set whatever today is, so an account that writes nothing
after a period rolls over now sees last period's analysis with nothing saying so. `isCurrentPeriod`
does not catch it - it asks which period the screen shows, not when the set was generated. Restoring
the eyebrow is the wrong fix, because the defect is staleness rather than a missing name.

**5.3 The button names its destination.** "Ask about your spending →" becomes "Ask AI Assistant
about your spending". The arrow was standing in for the destination the words did not name - and the
same four words are the visible label of the composer it lands on, so the button and the field read
identically today. Naming the assistant is what separates them. Note the composer's own label is
**not** changed: `insights/page.test.tsx` asserts it by that exact string, and it is a different
control.

**5.4 Regenerate: the premise was right, deleting it was not.** The question was whether the button
is needed at all, given the set regenerates itself. It is: `insight-triggers.listener.ts` handles
`TRANSACTION_CHANGED` **and** `CATEGORY_CHANGED`, so every transaction and category write starts a
run, and on the ordinary path the button restates what the app already did.

But it cannot simply go, because three states reach this card with no run coming: an account whose
transactions **predate** the write-path trigger, an account whose first run **failed** (`runGeneration`
marks the row `failed` and the read falls back, so a failure and a fresh account render identically),
and a run this mount **gave up** on at the 5.5-minute ceiling. In the first two the only other way to
start a run is to go and edit a transaction, which is not advice any copy on this card could give.

So it renders only where it can act: `stalled || (displayState === 'empty' && !isEmpty)`. Three
consequences worth knowing. **`stalled` had to be exposed** from `InsightPoll`, because
`displayState` deliberately folds a stall into `ready` or `empty` - which is exactly what would hide
the one state where the control matters most. **`isEmpty` is excluded**: an account with nothing
logged would get the same empty set back. And **the previous version's own test fixture disagreed
with its comment** - it asserted the button in the unlock state (`isEmpty: true`) while justifying it
with the two states that have transactions in them; that is corrected, and the unlock state now has a
case pinning the button's absence.

**Four tests moved from the `ready` fixture to the pending one**, because a click from `ready` is no
longer a path a user can take, and two more were asserting `Regenerate` as a **proxy for "the run
settled"** - that proxy is precisely what changed, so they now assert the skeleton's absence directly
and the button's absence as the new rule.

## Out of scope

- **Every screen that is not the Dashboard.** Same boundary PET-76 held.
- ~~**A sweep for other `.card-body` `<p>` pairs.**~~ **Superseded by item 4**, which is the third
  instance and the one that made the sweep this ticket's business rather than the next one's. It ran,
  it found nothing, and both the method and the false start are recorded above. What stays out of
  scope is *acting* on the 27 benign hits: a grown box whose text is already where it belongs is not
  a defect, and converting them all to `<span>`s would be a large diff defending against nothing.

## Task checklist

- [ ] Commit this plan alone, push the branch, open a draft PR with this checklist in its body
- [ ] Item 1: the donut's two centre lines become `<span>`s in both branches of `CategoryDonut.tsx`
- [ ] Item 1: record the cause in `frontend/CLAUDE.md`'s existing `.card-body p` entry - the same
      rule on the block axis, which that entry does not yet cover
- [ ] Item 2: add `dashboard/CategoryHover.tsx` - the provider, the throwing hook and `LegendRow`
- [ ] Item 2: delete the tooltip and `SliceTooltip` from `CategoryRing`; outline the active arc from
      the shared state; wire both pointer directions
- [ ] Item 2: wrap the ring and the legend in the provider and move each row into `LegendRow`,
      keeping the row's content as server-rendered children
- [ ] Item 2: update the two story docblocks that tell the reader to hover for a tooltip, and
      `PreferencesProvider.tsx`'s consumer list
- [ ] Item 2: cover the new behaviour in `CategoryDonut.test.tsx` - the hook throwing outside the
      provider, and the absence of any new tab stop
- [ ] Item 3: `TrendTooltip` renders the date range only, and returns `null` for an empty range
- [ ] Item 4: `BudgetCard`'s two readout figures become `<span>`s
- [ ] Item 4: sweep every signed-in screen for the same rule, and record the verdict split rather
      than a hit count
- [ ] Item 4: correct `frontend/CLAUDE.md`'s `text-right` advice, which is wrong for an adjacent pair
- [ ] Item 5.1: the banner becomes `bg-primary/20` over `border-primary/30`, measured composited in
      both themes against the canvas *and* against a plain card
- [ ] Item 5.2: delete the eyebrow and the `overline` prop; record the staleness it gives up in
      `docs/TODO.md`
- [ ] Item 5.3: the button label names the assistant, leaving the composer's own label alone
- [ ] Item 5.4: Regenerate renders only where it can act; expose `stalled` for the state
      `displayState` folds away
- [ ] Item 5.4: correct the test fixture that asserted the button in the unlock state, and re-point
      the cases that used it as a proxy for "the run settled"
- [ ] Further items, appended as they are reported
- [ ] Rewrite PET-78's description with these as real acceptance criteria
- [ ] Verify (below), then take the PR out of draft

## Verification

Gates, from each app's own directory:

- `npm test` in `frontend/` (and `backend/` if any item reaches it)
- `npm run build` in `frontend/` - the typecheck
- `npx tsc --noEmit` in `frontend/`, because `npm run build` never reads `*.test.tsx`
- `npm run lint` in `frontend/`, `npm run build-storybook`
- `npm run docs:check` at the root

Then the browser walk, headless Chromium over the DevTools protocol, because every item here is a
defect that passes all of the above:

- **Item 1**: the amount and the caption both sit **inside** the hole -
  `distanceFromCentre + height / 2 <= innerRadius` for each - and the pair's own centre stays on the
  hole's centre. `flexGrow` computes to `0` on both lines. The pre-fix markup is probed in the same
  run and seen to fail, per `docs/agents/claude-tooling.md`: a check that has never failed is not
  evidence. Measured on the Storybook stories **and** on the real `/dashboard`, in the populated and
  the empty branch, in light and dark.
- **Item 2**: with a real `mouseover` dispatched onto an arc through the DevTools protocol - the
  legend row's background changes and its laid-out height does **not**, and the arc takes the
  `base-content` stroke. Dispatched onto a legend row, the arc takes the stroke too. No tooltip
  element exists in the tree at any point, and the card still reports zero tab stops. Both themes,
  because a stroke colour is a theme value and every measured figure is void across a theme change.
- **Item 5**: the banner's fill and border composited over the canvas and read as painted pixels, in
  both themes, against the canvas **and** against an ordinary `base-100` card - the second comparison
  is the one that rejected the first tint tried. Plus the body copy's own contrast on the new fill,
  which is a second composite rather than the same one. The three copy changes are read off the
  rendered card in the same run: no eyebrow, the new label, and no Regenerate in the `ready` state.
  Regenerate's presence in the pending and stalled states is Jest's, since reaching either on the real
  screen needs an account whose set is missing or whose run hangs.
- **Item 4**: the measured distance between the end of the spend figure and the start of "of
  {budget}" is the `gap-2` the markup asks for and not a fraction of the card's width, with the
  pre-fix `<p>` markup probed in the same run and seen to produce the runaway. Plus the sweep, whose
  own discrimination is that probe.
- **Item 3**: with the pointer on a bar, the tooltip's text is the date range and contains no
  currency symbol and no digits from the amount, while the bar's own label still paints it. Measured
  on the real `/dashboard`, since Recharts never activates a tooltip under jsdom - which is also why
  no Jest case covers this and the walk is the whole check.
