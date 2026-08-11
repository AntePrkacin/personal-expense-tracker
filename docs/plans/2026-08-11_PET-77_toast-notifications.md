# PET-77: One toast region for every write

Jira: [PET-77](https://decode.atlassian.net/browse/PET-77) · Epic:
[PET-2 App shell, navigation and design system](https://decode.atlassian.net/browse/PET-2) · Design:
**none**. A29 designs no toast and no error surface, so the treatment, the placement, the durations
and every string in this plan are invented and owe a designer. The ticket carries `design-review`
for that reason.

Base branch: `main`, as `feat/PET-77-toast-notifications`. See Branching below, because the PET-48
follow-up is not merged and this touches two of its files.

## Why

`docs/TODO.md` carries the write-up, marked HIGH IMPORTANCE by the product owner on 2026-08-11, and
it is the authority for the problem rather than this section. The short form: every authenticated
write reports success its own way, in four unrelated treatments invented one ticket at a time - a
modal that just closes, a `role="status"` badge in `settings/SettingsForm.tsx`, a `role="status"`
line in `transactions/categories/AllocateBudgetModal.tsx`, and nothing whatsoever. A save whose row
lands outside the current period or filter is confirmed by nothing at all.

This replaces the success half of every write in the app and is the first thing here that renders
outside a route's own tree.

## What the app already decided, and what this must not re-decide

| The repo already holds | Where it is written | What this plan does with it |
| --- | --- | --- |
| A live region created in the same commit as its content is generally not announced | `AllocateBudgetModal.tsx`, `SettingsForm.tsx`, `insights/TypingIndicator.tsx` | The polite region mounts empty at the layout and only its children change |
| An inserted-on-demand `role="alert"` **does** announce | `components/FormError.tsx`, and four screens using it | Failure toasts carry `role="alert"` on the toast element itself |
| Nothing in this app picks a z-index; the top layer arranges everything | `Modal.tsx`, `TransactionRowMenu.tsx`, `PopoverMenu.tsx` | The region is a `popover`, not a chosen z-index. See Decision 1 |
| jsdom implements none of the Popover API and `jest.setup.ts` fakes none of it | `TransactionRowMenu.tsx`, `docs/TODO.md` | The popover call is a guarded seam so every content assertion still runs under Jest |
| A shared component only earns its own file at the third consumer | `frontend/src/components/CLAUDE.md` | Twelve consumers, so this is not that argument |
| Semantic daisyUI colour only; a raw Tailwind colour compiles and bypasses the theme | `frontend/CLAUDE.md` | `alert-success` / `alert-error`, no palette classes |

## Decision 1: the top layer, which is the one real risk in this ticket

`Modal` opens with `showModal()`, so a dialog sits in the **top layer** and paints over everything
with no stacking context to arrange. daisyUI's `.toast` is `position: fixed` and nothing more - read
out of `frontend/node_modules/daisyui/components/toast.css` rather than guessed - so a toast raised
while a modal is open renders **behind it**, whatever z-index it is given. That is the whole of
`docs/TODO.md`'s "`<dialog>`-adjacent problem", and it is the reason this ticket is not four lines.

The shape to check first, per that entry, is the **`popover` attribute**, which is how this app's
four menus and two pickers already reach the top layer. Three things about it are not obvious and
one of them can change the component, so the plan opens with a browser walk rather than closing
with one.

**Ordering is by when an element entered the top layer, not by markup order.** A region shown once
at mount is *below* every dialog opened afterwards. So `showPopover()` fires **on each post** - hide
then show when it is already open - which puts the region above whatever dialog is currently up. It
is the only spelling that works for a toast raised from inside a modal, which is most of them.

**Inertness was the open question, and the walk answered it: not exempt.** Chrome 4-case probe, run
before the component was written, against a bare `<dialog>` opened with `showModal()` and a
`popover="manual"` region carrying daisyUI's own `.toast` rule set:

| Case | Result |
| --- | --- |
| Popover shown **after** the dialog | Paints **above** it - bright over the dimmed `::backdrop` |
| Popover shown **before** the dialog | Paints **under** it - visibly dimmed by the same backdrop |
| Its dismiss button, while the dialog is open | **Inert.** `elementFromPoint` resolves to the dialog, and a real click at the button's own coordinates never reached the handler; the toast was still on screen afterwards |
| The same button, dialog closed | Hit-testable, click received - so the button is fine and inertness is the cause |
| A popover that is a **DOM descendant** of the open dialog | Hit-testable **while the dialog is open** |

Two consequences, and they are the reason this walk came first. **The re-show rule is load-bearing
rather than defensive**: case 2 is what a region shown once at mount looks like for the rest of the
session, and it is the common case, because most toasts here are raised from inside a modal.
**AC10's second half is met only when no modal is open.** The toast paints correctly and announces
correctly in every case; its dismiss button is decorative while a modal is up, and the auto-dismiss
is what clears it. Case 5 says the only fix is nesting the region inside whichever dialog is
topmost, which is a React portal into a DOM node owned by one of four providers - a great deal of
fragility to buy back a control the timer already covers on a surface the user is about to leave.
Rejected, recorded here, and flagged on the PR rather than settled quietly.

**The popover UA stylesheet has to be undone.** `:popover-open` brings `inset: 0`, `margin: auto`, a
border, padding, `width/height: fit-content` and `overflow: auto`; daisyUI's `.toast` already zeroes
the background and sets its own insets, but the border, padding and margin need `border-0 p-0 m-0`
or the stack draws a black hairline box around itself.

`popover="manual"` rather than `"auto"`: light dismiss on an `auto` popover would close the whole
stack when the user clicks anything, which for a notification region is a bug rather than a feature.

## Decision 2: two politeness levels, one region

AC12 wants success announced politely and failure assertively, and one element carries one
`aria-live`. Three shapes were considered.

**Two sibling regions** splits the visual stack in two, so a success and a failure raised together
are drawn in the order of their politeness rather than the order they happened.

**A visible stack plus two `sr-only` announcer regions** decouples the two completely and is the
common pattern, at the cost of every string existing twice in the DOM and being announced twice for
anybody who tabs to the toast.

**One region, `aria-live="polite"`, mounted empty at the layout, with `role="alert"` on the
individual failure toast** is what this plan builds. It keeps one visual stack in one order, and
both halves are precedents this repo already paid for: the empty-mounted polite region is
`AllocateBudgetModal`'s finding, and an inserted `role="alert"` announcing correctly is what
`components/FormError.tsx` has relied on across four screens. A nested assertive region inside a
polite one is the ordinary way to express both.

It is a screen-reader check rather than a Jest one, so it goes on the verification list beside
`Modal`'s Escape and the focus trap.

## Decision 3: which failures toast, and which stay inline

AC4 draws the line at "a reason no form field can carry", and the app already has the vocabulary to
apply it exactly: every `lib/*.ts` write publishes a **named failure taxonomy** - three to five
reasons each, and `frontend/CLAUDE.md` explains why each count is what it is. So the split is per
reason rather than per call site.

- **Inline, unchanged.** A reason the user can act on in the form in front of them: `invalid`
  (a 400 they can fix), `categoryMissing`, `missing` and `fallback` (copy that asks them to close
  and see the current list, which is an instruction rather than a report), and `taken` on the
  profile save, whose copy names the cause.
- **Toast.** A reason they cannot act on where they are: `failed`, `unauthenticated`, and every
  arm of a write with no form at all - the two deletes, the caps save, the scan, the chat and the
  regenerate.

This is why `components/FormError.tsx` survives the ticket rather than being replaced by it: the
messages that stay are precisely the ones it exists for.

## Decision 4: what is removed, and one flagged consequence

AC13 deletes both surviving success treatments. The Settings badge is a clean swap - it exists only
because that screen has no dialog to close, which is what the toast now answers.

**The Allocate modal's snap line is the one to read before deleting.** It is not a write
confirmation: it fires on a keystroke, when a typed cap is clamped to what is left of the budget,
and it describes a **field**. Deleting it makes the clamp silent for a screen-reader user, and it
cannot be replaced by a toast, because a toast per keystroke is not a notification, it is a stream.
The plan carries out the ticket, and records the recommendation here so the product owner can settle
it on the PR rather than after it: **keep the snap line**, on the grounds that AC13's argument -
that one write should not be confirmed twice - does not reach a message about a value rather than
about a save.

## Decision 5: where the files live, and the mount point

`(app)/ToastProvider.tsx` and `(app)/ToastRegion.tsx`, beside the layout. This is `Modal.tsx`'s own
argument unchanged: `components/ui/` mirrors the Figma Components page and this is not a tile, and
`components/` is for things spanning route segments in *different* trees, where every consumer here
is inside the `(app)` group. Stories are filed under **Shell** for the same reason, which means they
join `(app)/shell.stories.test.tsx` rather than `ui.stories.test.tsx`.

Two files rather than one so Storybook and the suite get a synchronous, state-free component to
render: `ToastRegion` takes a list and an `onDismiss`, `ToastProvider` owns the queue, the timers and
the popover seam. Same split `WelcomeScreen`, `CheckEmailScreen` and `ErrorScreen` each make against
their route file.

**It mounts outermost of the five providers on `(app)/layout.tsx`**, outside `PreferencesProvider`.
It consumes nothing, and everything that may post is inside it - which includes the three dialogs the
other providers mount. The nesting order is load-bearing in the same way `EditTransactionProvider`'s
is, so `layout.test.tsx` pins it with a child that posts, exactly as it pins the edit provider with a
child that opens the modal.

`useToast()` **throws outside the provider** rather than returning a no-op, the call
`AddTransactionProvider` and `useFilterNavigation` both make: a write whose confirmation silently
stops appearing is a bug that looks like a fast network.

## The API

```
useToast().post({ kind: 'success' | 'failure', message: string })
```

`message` is a whole sentence rather than a key, because there is no copy module in this repo and
one string per call site is what every other screen here does.

**Durations are per kind**: success 5s, failure 8s. AC11 asks for an auto-dismiss and a failure the
user blinked past is the worse of the two failures, so the longer one carries it. Both dismiss on a
control as well.

**At most three are visible**; a fourth drops the oldest. A burst is real - `updateCategoryCaps` is
one write but `ConfirmDeleteDialog` is reachable in a loop - and an unbounded column climbs off the
top of the viewport.

**Ids come from a ref counter in the provider**, not `Date.now()` or `randomUUID()`: a monotonic
integer is stable under Jest and under React Strict Mode's double render, and nothing about a toast
needs an unguessable id.

## Call sites

Twelve, and none of them is a new write. Each replaces a treatment it already has, or fills a
silence.

| Component | Posts | Replaces |
| --- | --- | --- |
| `(app)/AddTransactionModal.tsx` | transaction created; scan finished or failed | a modal that just closes; a form that just fills |
| `(app)/EditTransactionModal.tsx` | transaction saved | a modal that just closes |
| `(app)/ConfirmDeleteDialog.tsx` | transaction or category deleted | a dialog that just closes - **one edit, both nouns**, since PET-39's extraction already unified them |
| `transactions/categories/AddCategoryModal.tsx` | category created | a modal that just closes |
| `transactions/categories/EditCategoryModal.tsx` | category saved | a modal that just closes |
| `transactions/categories/AllocateBudgetModal.tsx` | caps saved | a modal that just closes; and the snap line goes |
| `settings/SettingsForm.tsx` | changes saved, or the partial case | the `role="status"` badge |
| `dashboard/InsightPoll.tsx` | insights regenerated, **manual only** | nothing |
| `(app)/AddTransactionModal.tsx` scan arm | scan failed | an inline line |
| `insights/AssistantChatScreen.tsx` | turn failed | an in-thread message |
| `insights/AssistantComposer.tsx` | turn stopped | nothing |
| `transactions/[id]/TransactionDetailActions.tsx` | - | nothing: the shared dialog reports, and this page navigates away |

**Settings is the one with an arm of its own.** That save is two writes -
`lib/changeSchedule.ts` then `lib/updateProfile.ts` - and the second can fail after the first landed.
Three outcomes rather than two: both landed (one success toast), the schedule landed and the profile
did not (a failure toast that says the pay schedule was saved and the profile was not, because a bare
"could not save" over a schedule change that did land is the one thing this screen must not say), and
the schedule failed (nothing was written, ordinary failure). That ordering is deliberate and already
recorded in `frontend/src/app/CLAUDE.md`.

**The insight arm is the one with a rule rather than a message.** A background regeneration - the run
behind every transaction and category write - posts **nothing**, which is a decision on the ticket
rather than an omission. `InsightPoll` already distinguishes the two, since a manual run starts from
a click and a background one from the `state` prop changing, and that distinction is what the post
hangs off.

## Copy

Every string is invented and joins what A29 owes. Kept in the component that posts it, as this repo
does everywhere else, rather than in a copy module that does not exist.

| Event | String |
| --- | --- |
| Transaction created | Transaction added. |
| Transaction saved | Transaction saved. |
| Transaction deleted | Transaction deleted. |
| Category created | Category added. |
| Category saved | Category saved. |
| Category deleted | Category deleted. Its transactions moved to Uncategorized. |
| Caps saved | Category limits saved. |
| Settings saved | Changes saved. |
| Settings partial | Your pay schedule was saved, but your profile changes were not. |
| Insights regenerated | Insights updated. |
| Scan finished | Receipt scanned. |
| Scan found nothing | We could not read that receipt. Fill the form in yourself. |
| Any `failed` arm | Something went wrong. Please try again. |
| Any `unauthenticated` arm | Your session has ended. Please log in again. |
| Chat turn failed | The assistant could not answer. Please try again. |
| Chat turn stopped | Response stopped. |

Two of them are deliberately not generic. The category delete names where the transactions went,
because "deleted" over money that moved is a half-truth, and it is the one string here that has to
agree with `DeleteCategoryDialog`'s own copy about the fallback's name. And the scan's second arm
says what to do next, because a scan that read nothing is not a failure of the app.

## Branching

Based on `main` at `0844829`, which is PR #85's merge and carries the whole of PET-48 - the summary
card **and** the Manage categories modal that followed it. An earlier draft of this section had them
unmerged and planned around a stack; that was a stale local `main` rather than a fact about the
repository, and there is nothing to stack on.

What that merge means for this ticket is that `settings/SettingsForm.tsx`,
`settings/ManageCategoriesModal.tsx` and the four prose files are all at their post-PET-48 shape
here, so the "Changes saved" badge this plan deletes is the one that branch last touched.

## Task checklist

- [ ] Walk Chrome first: a `popover="manual"` element shown while a `Modal` is open, checking that
      it paints above the dialog **and** whether its dismiss button responds. Record the answer in
      this plan before writing the component, because the second half can change it.
- [ ] `(app)/ToastRegion.tsx`: the stack, the two kinds, the dismiss control, the popover reset
      classes, `aria-live="polite"` on the region and `role="alert"` on a failure toast.
- [ ] `(app)/ToastProvider.tsx`: the queue, the ref counter, per-kind durations, the cap of three,
      the guarded `showPopover()` seam, and a `useToast()` that throws outside the provider.
- [ ] `Shell/Toast` stories: one of each kind, a stack of three, a long message, and one raised over
      an open `Modal`. Open them - a story that only builds has not been reviewed.
- [ ] Mount it outermost on `(app)/layout.tsx`; extend `layout.test.tsx` with a child that posts, so
      the nesting order is pinned rather than discovered.
- [ ] Transaction writes: `AddTransactionModal`, `EditTransactionModal`, `ConfirmDeleteDialog`.
- [ ] Category writes: `AddCategoryModal`, `EditCategoryModal`, `AllocateBudgetModal`, and the
      `CapPeriodDialog` path into the edit modal.
- [ ] Settings: post from `SettingsForm`, including the partial arm, and **delete the "Changes
      saved" badge** with the timer and the state behind it.
- [ ] AI: `InsightPoll`'s manual arm only, the scan's two arms in `AddTransactionModal`, and the
      chat's failed and stopped arms.
- [ ] Apply Decision 3 across all twelve: move only the `failed` and `unauthenticated` reasons out
      of `FormError` and leave every actionable message inline.
- [ ] Delete the Allocate modal's snap `role="status"` line per AC13, and its assertions with it.
- [ ] Suites: `ToastRegion.test.tsx` and `ToastProvider.test.tsx`; one assertion per call site that
      the toast is posted; update `SettingsForm.test.tsx` and `AllocateBudgetModal.test.tsx` for the
      two treatments that are gone.
- [ ] Browser walk across all four routed views in both themes: a toast over an open modal, a stack
      of three, dismissal, auto-dismiss, and a toast surviving the `router.refresh()` its own write
      triggered.
- [ ] Docs: the shell section of `frontend/src/app/CLAUDE.md`, the root `CLAUDE.md` paragraph, and
      **delete the HIGH IMPORTANCE entry from `docs/TODO.md`** - recording what it leaves behind,
      which is the screen-reader check, the inert-while-modal answer, and the invented strings A29
      still owes.
- [ ] Gates: `npm run build`, `npm run lint`, the full suite, `npm run docs:check`. **No
      `npm run api:sync`** - no request or response body changes anywhere in this ticket.

## Verification

Three things in this ticket cannot be proven by a Jest suite, and all three are on the same list as
`Modal`'s Escape and `BudgetForm`'s caret restore.

**The top layer**, because jsdom implements no Popover API at all - the region falls back to an
ordinary fixed element there, which is what keeps every content assertion honest and also what makes
the stacking untestable. Chrome, over an open modal.

**The announcement**, because `getByRole('status')` cannot tell a working live region from one that
was created with its content - the finding this repo has now paid for three times. A real screen
reader, once for each kind.

**The colours**, because both kinds are `alert-*` over whatever the page holds and this repo has
twice measured a token that computed to nothing visible. Both themes.
