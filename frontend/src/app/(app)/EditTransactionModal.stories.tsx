import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useRef } from 'react';

import type { Transaction } from '@/lib/transactions';

import { EditTransactionModal } from './EditTransactionModal';

// Type-only Storybook import, for the reason `Sidebar.stories.tsx` records: importing any *value*
// from Storybook breaks the Jest story smoke test with an opaque ESM error, because
// @storybook/nextjs-vite will not load under Jest.
//
// **`parameters.nextjs.appDirectory` is load-bearing and no gate will tell you it is missing.**
// The modal calls `useRouter` for its post-save refresh, and `next/navigation` throws "invariant
// expected app router to be mounted" outside a router. Both CI gates miss it from opposite
// directions - `build-storybook` bundles stories without running one, and
// `screens.stories.test.tsx` renders them under Jest with `next/navigation` already mocked.
//
// The modal takes everything as props, so these stories need no provider and no fetch: the row is
// a literal, the options are a literal and both actions are stubs.
// `EditTransactionProvider.test.tsx` covers the wiring that supplies them for real.
//
// **`Screens/06 Transactions — List` is the other half of this ticket's review**, and the two are
// not interchangeable. This module is where the box is diffed against frame 11; that one is where
// the modal is opened from a real kebab, which is the only place the focus trap, Escape and the
// confirmation-over-the-modal stacking can be seen at all.

const meta: Meta<typeof EditTransactionModal> = {
  title: 'Screens/11 Edit transaction',
  component: EditTransactionModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof EditTransactionModal>;

/** The account's categories, ordered by name as the backend returns them. */
const CATEGORIES = [
  { id: '0198c2a1-0000-7000-8000-0000000000a3', name: 'Dining out' },
  { id: '0198c2a1-0000-7000-8000-0000000000a4', name: 'Entertainment' },
  { id: '0198c2a1-0000-7000-8000-0000000000a1', name: 'Groceries' },
  { id: '0198c2a1-0000-7000-8000-0000000000a5', name: 'Housing' },
  { id: '0198c2a1-0000-7000-8000-0000000000a2', name: 'Transport' },
  { id: '0198c2a1-0000-7000-8000-0000000000ff', name: 'Uncategorized' },
];

/**
 * Frame 11's own row (node 29:196): Whole Foods, $24.00, Oct 8 2025, Groceries, "Weekly
 * groceries".
 *
 * Sample data, and the persona is the spec's own - `marko@email.com`'s spending rather than
 * anybody's real transactions.
 */
const TRANSACTION: Transaction = {
  id: '0198c2a1-0000-7000-8000-0000000000b1',
  amount: 24,
  categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
  date: '2025-10-08',
  merchant: 'Whole Foods',
  note: 'Weekly groceries',
  createdAt: '2025-10-08T09:30:00.000Z',
  updatedAt: '2025-10-08T09:30:00.000Z',
};

/** Accepts everything, so the happy path closes. */
const accept = async () => ({ ok: true }) as const;

/** Never resolves, which is how the in-flight footer is drawn. */
const hang = () => new Promise<never>(() => {});

/**
 * Types into a controlled field the way React can see, for the two stories that drive the form.
 *
 * **`field.value = x` is not enough, and a browser walk is what proved it.** React installs its own
 * `value` setter on the input instance and tracks the last value it wrote; assigning through that
 * shadowed property updates the DOM without telling React, so the following `input` event is
 * dispatched with the tracker still holding the old value and `onChange` never runs. Both stories
 * below then submitted a form React still believed was **unchanged** - which, since PET-32 closes
 * without a request in exactly that case, meant they rendered a closed modal instead of the state
 * they exist to show. Going through the prototype's own setter is what moves the tracker.
 *
 * This is the standard React-testing idiom rather than an invention; `user-event` does the same
 * thing, which is why no Jest suite here needs it.
 */
function typeInto(field: HTMLInputElement | null, value: string) {
  if (field === null) return;

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Submits the modal's form on the next task, after React has committed what `typeInto` wrote.
 *
 * **The second half of the same browser-walk finding, and the less obvious one.** React batches the
 * state updates from those synthetic `input` events until the current task finishes, so a
 * `requestSubmit()` on the line after them runs against the *previous* render's values - a form
 * these stories have just emptied, which the handler still sees as prefilled, valid and unchanged,
 * so it closes without a request. The visible symptom was a closed dialog with empty fields behind
 * it: the edits had landed and the submit had not seen them.
 *
 * A `setTimeout` rather than an `await`ed microtask because the commit is what has to happen in
 * between, not just a promise resolution.
 */
function submitNextTask(root: HTMLElement) {
  const timer = setTimeout(() => root.querySelector('form')?.requestSubmit(), 0);
  return () => clearTimeout(timer);
}

/**
 * The modal as frame 11 draws it (node 29:196).
 *
 * What to diff against Figma is the structure, not the pixels: the box centred over the dimmed
 * page, **every field carrying the row's stored value**, the Amount field focused with its `$`
 * prefix, Date and Merchant sharing a row, and the footer's three controls - a red "Delete
 * transaction" with its trash glyph flush **left**, Cancel and "Save changes" grouped right. Width,
 * radius, shadow and the focus ring are the theme's as of PET-57.
 *
 * Two things to actually look at, because they are the differences from frame 09 rather than the
 * similarities. The Category select shows **Groceries** rather than a `Select…` placeholder, since
 * a stored transaction always has one. And the amount reads `24.00` rather than `24`: the value is
 * stored as a number and `toTransactionFormValues` is what puts the cents back, so this is where a
 * regression to `24` would be visible.
 *
 * **Press "Save changes" without touching anything.** The modal closes and no request is made,
 * which is deliberate - the endpoint rejects an empty patch, and there is nothing to ask it.
 */
export const Default: Story = {
  render: () => (
    <EditTransactionModal
      transaction={TRANSACTION}
      categories={CATEGORIES}
      update={accept}
      onDelete={() => {}}
      onClose={() => {}}
    />
  ),
};

/**
 * A row with no note, which is the more common shape and which no frame draws.
 *
 * Worth its own story because `note` is the one nullable field: it must render as an empty optional
 * field rather than the string "null", and clearing an *existing* note is what sends the `null`
 * that deletes it.
 */
export const WithoutANote: Story = {
  render: () => (
    <EditTransactionModal
      transaction={{ ...TRANSACTION, note: null }}
      categories={CATEGORIES}
      update={accept}
      onDelete={() => {}}
      onClose={() => {}}
    />
  ),
};

/**
 * Every validation message at once, which is the artifact A29 owes a designer.
 *
 * Assumption A29 records that **no form error visual exists anywhere in the Figma file**, so the
 * pattern - daisyUI's `input-error` / `select-error` border plus one `text-error` line, no icon -
 * and all four strings are ours. They are frame 09's strings verbatim, because each states a rule
 * rather than an operation.
 *
 * This story clears the two clearable required fields and submits on mount, so the messages appear
 * together on a form that was **prefilled** - which is the state worth reviewing here rather than
 * on an empty form, since it is the only way a user reaches validation in an edit.
 *
 * The five post-network failure lines are not shown here: each replaces the others, they need a
 * round trip to provoke, and `EditTransactionModal.test.tsx` pins all five strings.
 */
export const WithMessages: Story = {
  render: () => {
    // A local component so the hooks run inside a render pass. The smoke harness calls
    // `render(args)` outside React, so a hook written directly in here would throw "invalid hook
    // call" in a suite that never opens a browser - the same constraint `Shell/Modal`'s
    // `FromTrigger` story works within.
    function Demo() {
      const host = useRef<HTMLDivElement>(null);

      useEffect(() => {
        const root = host.current;
        if (root === null) return;

        // Cleared through the field rather than by passing empty values, because there is no prop
        // for "start invalid" - and there should not be: an edit form is prefilled by definition,
        // so emptying a field is the only route to a message here.
        for (const id of ['edit-transaction-amount', 'edit-transaction-merchant']) {
          typeInto(root.querySelector(`#${id}`), '');
        }

        // `requestSubmit` rather than clicking, so this goes through the form's own submit path -
        // the one that runs validation - instead of simulating a pointer. The form is found by tag
        // because a <form> only publishes the `form` role once it has an accessible name.
        return submitNextTask(root);
      }, []);

      return (
        <div ref={host}>
          <EditTransactionModal
            transaction={TRANSACTION}
            categories={CATEGORIES}
            update={accept}
            onDelete={() => {}}
            onClose={() => {}}
          />
        </div>
      );
    }

    return <Demo />;
  },
};

/**
 * The save in flight, which A19 designs no state for.
 *
 * Only "Save changes" is disabled. Cancel, the X and **"Delete transaction"** all stay live
 * deliberately: no fetch in this app carries a timeout, so a hung request is exactly when a visible
 * way out matters most, and the only thing disabling the submit is there to prevent is a second
 * patch racing the first.
 */
export const Saving: Story = {
  render: () => {
    function Demo() {
      const host = useRef<HTMLDivElement>(null);

      useEffect(() => {
        const root = host.current;
        if (root === null) return;

        // Edited first, then submitted: an unchanged form closes without a request, so submitting
        // it would show the closed state rather than the pending one.
        typeInto(root.querySelector('#edit-transaction-merchant'), 'Whole Foods Market');

        return submitNextTask(root);
      }, []);

      return (
        <div ref={host}>
          <EditTransactionModal
            transaction={TRANSACTION}
            categories={CATEGORIES}
            update={hang}
            onDelete={() => {}}
            onClose={() => {}}
          />
        </div>
      );
    }

    return <Demo />;
  },
};

/**
 * The categories read having failed, which no frame draws either.
 *
 * The select is disabled and a `role="alert"` line says why, because a control that is inert with
 * no explanation is worse than a message. Note what this state does **not** lose: every other field
 * is still prefilled, because the row carries its own values and only the picker's *options* need
 * the network. Reachable when the session dies or the backend is down between opening the modal and
 * the read landing.
 */
export const CategoriesUnavailable: Story = {
  render: () => (
    <EditTransactionModal
      transaction={TRANSACTION}
      categories={null}
      categoriesFailed
      update={accept}
      onDelete={() => {}}
      onClose={() => {}}
    />
  ),
};
