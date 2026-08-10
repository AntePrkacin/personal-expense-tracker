import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { DeleteTransactionResult } from '@/lib/deleteTransaction';

import { PreferencesProvider } from './PreferencesProvider';
import { DeleteTransactionDialog as Dialog, type DeleteTarget } from './DeleteTransactionDialog';

/**
 * DeleteTransactionDialog inside the shell's preferences, which is what gives it a currency to format with.
 *
 * **A wrapper rather than a `decorators` entry.** The story smoke test builds each story from
 * `render` or `meta.component` and never applies a meta's decorators, so a decorator would work in
 * the browser and throw under Jest - the trap `frontend/src/app/CLAUDE.md` records under Storybook.
 * Wrapping the component keeps every story body below unchanged.
 */
function DeleteTransactionDialog(props: React.ComponentProps<typeof Dialog>) {
  return (
    <PreferencesProvider currency="USD" monthStartDay={1}>
      <Dialog {...props} />
    </PreferencesProvider>
  );
}

// 12 Delete confirmation (node 31:302).
//
// Type-only Storybook import, for the reason `Sidebar.stories.tsx` records: importing any
// *value* from Storybook breaks the Jest story smoke test with an opaque ESM error.
//
// Filed under "Shell" beside `Modal`, the same call `PageHeader` makes - this is not one of the
// tiles on the Figma Components page, it is the shell's own dialog.
//
// **`nextjs: { appDirectory: true }` is mandatory**, and no gate will tell you: the dialog calls
// `useRouter`, which throws `invariant expected app router to be mounted` outside a mounted
// router. `build-storybook` bundles stories without running one and the Jest harness has
// `next/navigation` mocked, so both are blind to it and only opening the story finds it.
//
// **These stories are the only review of this dialog's copy**, which A29 says the Figma file
// designs none of: the three failure lines below are ours and owe a designer's sign-off with
// the rest of what `docs/TODO.md` tracks against A29.

const meta: Meta<typeof DeleteTransactionDialog> = {
  title: 'Shell/Delete transaction',
  component: DeleteTransactionDialog,
  tags: ['autodocs'],
  parameters: {
    // daisyUI's `modal` centres the box in a full-viewport container, so Storybook's own
    // padding would only fight it.
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof DeleteTransactionDialog>;

/** Frame 12's own row: the "Whole Foods - $62.40" (Oct 8) its copy quotes. */
const TARGET: DeleteTarget = {
  id: '0198c2a1-0000-7000-8000-0000000000b1',
  merchant: 'Whole Foods',
  amount: 62.4,
  date: '2025-10-08',
};

/** Never resolves, so the pending state stays on screen to be looked at. */
const never = () => new Promise<DeleteTransactionResult>(() => {});

/**
 * The dialog as drawn, mounted open.
 *
 * What to check: the trash glyph in its tinted circle, the centred title under it, the body
 * quoting the merchant, a **positive** `$62.40` and the short `(Oct 8)`, and two equal-width
 * buttons - an outline Cancel and a solid `btn-error` Delete. Radius, shadow and the exact red
 * are the theme's rather than the frame's, which is PET-57's fidelity boundary.
 *
 * **There is deliberately no X.** Frame 12 draws none, and Cancel is the designed dismissal;
 * Escape and a backdrop click still close it, which is the thing to try here since jsdom can
 * assert neither.
 */
export const Open: Story = {
  render: () => (
    <DeleteTransactionDialog
      target={TARGET}
      remove={async () => ({ ok: true })}
      onClose={() => {}}
    />
  ),
};

/**
 * A longer merchant, to check the body wraps rather than overflowing the box.
 *
 * The interpolation is the one part of this copy that varies without limit: `CreateTransactionDto`
 * bounds the merchant at 200 characters, and nothing in the design draws one longer than
 * "Rent — October".
 */
export const LongMerchant: Story = {
  render: () => (
    <DeleteTransactionDialog
      target={{ ...TARGET, merchant: 'Whole Foods Market — Downtown Riverside', amount: 1284.05 }}
      remove={async () => ({ ok: true })}
      onClose={() => {}}
    />
  ),
};

/**
 * Mid-request: Delete disabled, Cancel still live.
 *
 * The asymmetry is deliberate and worth looking at. Delete is disabled because a second one
 * answers 404, which would replace a succeeding delete with "that transaction is already gone".
 * Cancel is not, because no fetch in this app carries a timeout and there is no X beside it to
 * fall back on - so a hung request is exactly when a visible way out matters most.
 */
export const Deleting: Story = {
  render: () => <DeleteTransactionDialog target={TARGET} remove={never} onClose={() => {}} />,
};

/**
 * The three failure lines, which A29 designs none of.
 *
 * Press Delete to see each. `missing` is the one to read carefully: it must **not** say "try
 * again", because the row is already gone and retrying answers 404 forever - that difference is
 * why `DeleteTransactionResult` has three arms rather than one.
 */
export const Failed: Story = {
  render: () => (
    <DeleteTransactionDialog
      target={TARGET}
      remove={async () => ({ ok: false, reason: 'failed' })}
      onClose={() => {}}
    />
  ),
};

export const AlreadyGone: Story = {
  render: () => (
    <DeleteTransactionDialog
      target={TARGET}
      remove={async () => ({ ok: false, reason: 'missing' })}
      onClose={() => {}}
    />
  ),
};

export const SessionExpired: Story = {
  render: () => (
    <DeleteTransactionDialog
      target={TARGET}
      remove={async () => ({ ok: false, reason: 'unauthenticated' })}
      onClose={() => {}}
    />
  ),
};
