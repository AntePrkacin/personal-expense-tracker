import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { DeleteCategoryResult } from '@/lib/deleteCategory';

import { DeleteCategoryDialog, type DeleteCategoryTarget } from './DeleteCategoryDialog';

// 20 Delete confirmation for category (node 102:1078).
//
// Type-only Storybook import, for the reason `Sidebar.stories.tsx` records: importing any *value*
// from Storybook breaks the Jest story smoke test with an opaque ESM error.
//
// Filed under "Shell" beside `Modal` and `Delete transaction`, the same call `PageHeader` makes -
// this is not one of the tiles on the Figma Components page. It is filed there rather than under
// `Screens/` even though the component lives beside a route, because what is being reviewed is a
// dialog rather than a frame of the app.
//
// **`nextjs: { appDirectory: true }` is mandatory**, and no gate will tell you: the dialog calls
// `useRouter`, which throws `invariant expected app router to be mounted` outside a mounted router.
// `build-storybook` bundles stories without running one and the Jest harness has `next/navigation`
// mocked, so both are blind to it and only opening the story finds it.
//
// **These stories are the only review of this dialog's copy**, which A29 designs none of: the four
// failure lines and both body shapes below are ours and owe a designer's sign-off with the rest of
// what `docs/TODO.md` tracks against A29. The body copy is also where two amendments to PET-39 are
// visible, so it is the thing to read first - see `Open` and `NoTransactionsThisMonth`.

const meta: Meta<typeof DeleteCategoryDialog> = {
  title: 'Shell/Delete category',
  component: DeleteCategoryDialog,
  tags: ['autodocs'],
  parameters: {
    // daisyUI's `modal` centres the box in a full-viewport container, so Storybook's own padding
    // would only fight it.
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof DeleteCategoryDialog>;

/** Frame 20's own card: the "Groceries" with 24 transactions its copy quotes. */
const TARGET: DeleteCategoryTarget = {
  id: '0198c2a1-0000-7000-8000-0000000000c1',
  name: 'Groceries',
  transactionCount: 24,
};

/**
 * The account's own fallback row.
 *
 * The frame says "Other" and the app says `Uncategorized`, which is PET-39's first amendment: that
 * role was deliberately split when the backend was built, so "Other" stays an ordinary chip anyone
 * can rename or delete. The screen reads this name off its own list response rather than writing it
 * down, and the stories pass the real one.
 */
const FALLBACK = 'Uncategorized';

/** Never resolves, so the pending state stays on screen to be looked at. */
const never = () => new Promise<DeleteCategoryResult>(() => {});

/**
 * The dialog as drawn, mounted open.
 *
 * What to check: the trash glyph in its tinted circle, the centred title under it, the body quoting
 * the name and the count, and two equal-width buttons - an outline Cancel and a solid `btn-error`
 * Delete. Radius, shadow and the exact red are the theme's rather than the frame's, which is
 * PET-57's fidelity boundary.
 *
 * **Two deliberate departures from the frame's copy, and this is where to review them.** It says
 * `Uncategorized` where the frame says "Other", and it says "24 transactions **this month** ...
 * along with any from earlier months" where the frame says "Its 24 transactions". The second is
 * because `transactionCount` is the current period's while the delete moves everything the category
 * ever held, so the frame's sentence understates on any account with history. Both are recorded on
 * the issue.
 *
 * **There is deliberately no X.** Frame 20 draws none, and Cancel is the designed dismissal; Escape
 * and a backdrop click still close it, which is the thing to try here since jsdom can assert
 * neither.
 */
export const Open: Story = {
  render: () => (
    <DeleteCategoryDialog
      target={TARGET}
      fallbackName={FALLBACK}
      remove={async () => ({ ok: true })}
      onClose={() => {}}
    />
  ),
};

/**
 * The second body shape: a category with nothing filed under it this period.
 *
 * A different sentence rather than a zero, because "Its 0 transactions this month will be moved" is
 * a sentence nobody writes - and with an empty period the clause carrying the information is the
 * one about earlier months, which this keeps. Reachable on any real account: a category created
 * last month and not used this one lands here.
 */
export const NoTransactionsThisMonth: Story = {
  render: () => (
    <DeleteCategoryDialog
      target={{ ...TARGET, name: 'Subscriptions', transactionCount: 0 }}
      fallbackName={FALLBACK}
      remove={async () => ({ ok: true })}
      onClose={() => {}}
    />
  ),
};

/**
 * A longer name, to check the body wraps rather than overflowing the box.
 *
 * The interpolation is the part of this copy that varies without limit: `CreateCategoryDto` bounds
 * the name at 60 characters, and nothing in the design draws one longer than "Entertainment".
 */
export const LongName: Story = {
  render: () => (
    <DeleteCategoryDialog
      target={{ ...TARGET, name: 'Household bills and utilities', transactionCount: 137 }}
      fallbackName={FALLBACK}
      remove={async () => ({ ok: true })}
      onClose={() => {}}
    />
  ),
};

/**
 * Mid-request: Delete disabled, Cancel still live.
 *
 * The asymmetry is deliberate and worth looking at. Delete is disabled because a second one answers
 * 404, which would replace a succeeding delete with "that category is already gone". Cancel is not,
 * because no fetch in this app carries a timeout and there is no X beside it to fall back on - so a
 * hung request is exactly when a visible way out matters most.
 */
export const Deleting: Story = {
  render: () => (
    <DeleteCategoryDialog
      target={TARGET}
      fallbackName={FALLBACK}
      remove={never}
      onClose={() => {}}
    />
  ),
};

/**
 * The four failure lines, which A29 designs none of. Press Delete to see each.
 *
 * Two of them must **not** say "try again", and that is why `DeleteCategoryResult` has four arms
 * rather than two: `missing` because the category is already gone and retrying answers 404 forever,
 * and `fallback` because that request is refused by design every single time.
 */
export const Failed: Story = {
  render: () => (
    <DeleteCategoryDialog
      target={TARGET}
      fallbackName={FALLBACK}
      remove={async () => ({ ok: false, reason: 'failed' })}
      onClose={() => {}}
    />
  ),
};

export const AlreadyGone: Story = {
  render: () => (
    <DeleteCategoryDialog
      target={TARGET}
      fallbackName={FALLBACK}
      remove={async () => ({ ok: false, reason: 'missing' })}
      onClose={() => {}}
    />
  ),
};

/**
 * The 409, which the UI cannot reach and whose message still has to be right.
 *
 * `CategoryCard` renders no menu at all on the `isFallback` card as of PET-38, so this arm is
 * reachable only by a stale tab or a devtools-driven call. It is classified and worded anyway,
 * because a hidden control is not an enforcement.
 */
export const CannotDeleteTheFallback: Story = {
  render: () => (
    <DeleteCategoryDialog
      target={{ ...TARGET, name: FALLBACK, transactionCount: 6 }}
      fallbackName={FALLBACK}
      remove={async () => ({ ok: false, reason: 'fallback' })}
      onClose={() => {}}
    />
  ),
};

export const SessionExpired: Story = {
  render: () => (
    <DeleteCategoryDialog
      target={TARGET}
      fallbackName={FALLBACK}
      remove={async () => ({ ok: false, reason: 'unauthenticated' })}
      onClose={() => {}}
    />
  ),
};
