import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { PaycheckMonthDialog } from './PaycheckMonthDialog';
import { currentPaycheckMonth } from './settingsForm';

// The paycheck question PET-72 puts in front of every budget or pay-day save. **No Figma frame
// behind it**, which makes these stories the only review it gets.
//
// Type-only Storybook import, for the reason `Sidebar.stories.tsx` records: importing any *value*
// from Storybook breaks the Jest story smoke test with an opaque ESM error.
//
// Filed under "Shell" beside `Modal`, `Delete transaction` and `Delete category`, the same call
// every non-tile makes. It is filed there rather than under `Screens/` even though the component
// lives beside a route, because what is being reviewed is a dialog rather than a frame of the app.
//
// **`nextjs: { appDirectory: true }` is not needed here and is deliberately absent**, which is worth
// stating because three sibling dialog stories carry it: this one reaches no router. Every close and
// every confirm is a prop, and the `router.refresh()` that follows a save belongs to `SettingsForm`.
//
// **What to review, since nothing else does.** SET-5 draws one "Save changes" and no dialog at all,
// so the title, the body, the field label and the glyph are all ours and owe A29's sign-off with the
// rest of what `docs/TODO.md` tracks against it. Three specific questions. Does the body actually
// explain what picking a month does - that earlier periods keep the budget they were spent against?
// Is a nine-month window the right range, four back and four forward around the current month? And
// is a confirmation the right shape at all, rather than a field sitting permanently on the card?
//
// Two things a suite cannot see and this can: the select's popup is the browser's, which is the whole
// argument for not building a sixth custom picker for nine rows, and Escape and a backdrop click both
// close the dialog through the platform rather than through code of ours.

const meta: Meta<typeof PaycheckMonthDialog> = {
  title: 'Shell/Paycheck month',
  component: PaycheckMonthDialog,
  tags: ['autodocs'],
  parameters: {
    // daisyUI's `modal` centres the box in a full-viewport container, so Storybook's own padding
    // would only fight it.
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof PaycheckMonthDialog>;

// Fixed rather than read off the clock, so the nine options below are the same list in every review
// - the opposite call `dashboard/DashboardScreen.stories.tsx` makes about its relative captions,
// where riding the real clock is what keeps "Today" saying today.
const TODAY = '2026-03-20';

/**
 * The dialog as it opens, on the month the form defaults to.
 *
 * `currentPaycheckMonth` is that default: the month the user is in, which is the answer that needs no
 * thought - a change made today most often applies from the paycheck that is about to arrive. It sits
 * in the middle of the list, with four months behind it and four ahead.
 *
 * What to check: the clock glyph in its tinted circle, the centred title, the body, the labelled
 * select, and a split footer whose wider button is the affirmative - `Modal`'s `'center'` shape,
 * which the two delete confirmations already use. **There is no X**, deliberately: Cancel is the
 * designed dismissal and this shape drops it.
 */
export const Open: Story = {
  args: {
    value: currentPaycheckMonth(TODAY),
    today: TODAY,
    pending: false,
    onChange: () => {},
    onConfirm: () => {},
    onClose: () => {},
  },
};

/**
 * A month in the past chosen, which is a **retroactive** schedule change.
 *
 * The case worth thinking hardest about, because it re-shapes periods that already have transactions
 * in them: the boundary before the chosen paycheck is removed and one stretched period runs up to it,
 * keeping the old budget. Nothing in this dialog says so beyond "from the paycheck you pick, onward",
 * and whether that is enough warning is the question this story exists to ask.
 */
export const Retroactive: Story = {
  args: { ...Open.args!, value: '2026-01' },
};

/**
 * A month in the future chosen, which stretches the **current** period up to it.
 *
 * The mirror of the case above and the gentler one: nothing already spent is re-priced, and the
 * period the user is in simply runs longer. Included because the two are one control and a reviewer
 * should see both readings of the same sentence.
 */
export const Future: Story = {
  args: { ...Open.args!, value: '2026-06' },
};

/**
 * The write in flight, which is the state SET-5 designs none of.
 *
 * Every control is disabled, **Cancel included** - which is the one place this dialog departs from
 * `ConfirmDeleteDialog`, where Cancel stays live. The difference is what the two promise: there,
 * Cancel does not claim to abort a delete already sent. Here the affirmative is the only thing that
 * writes, so a press during the round trip could only unmount the dialog whose write is still
 * landing, leaving the form with no way to report the outcome.
 */
export const Saving: Story = {
  args: { ...Open.args!, pending: true },
};
