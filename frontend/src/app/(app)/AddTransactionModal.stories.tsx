import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useRef } from 'react';

import type { ScanReceiptResult } from '../../lib/scanReceipt';

import { PreferencesProvider } from './PreferencesProvider';
import { AddTransactionModal as Wrapped } from './AddTransactionModal';

/**
 * The modal inside the shell's preferences.
 *
 * Its Amount / budget field prefixes the profile's currency symbol as of PET-47, which reaches
 * `useCurrency()` - so without this the story throws. A wrapper rather than a `decorators` entry,
 * for the reason `frontend/src/app/CLAUDE.md` records: the story smoke tests never apply a meta's
 * decorators, so a decorator works in the browser and fails under Jest.
 */
function AddTransactionModal(props: React.ComponentProps<typeof Wrapped>) {
  return (
    <PreferencesProvider currency="USD" monthStartDay={1}>
      <Wrapped {...props} />
    </PreferencesProvider>
  );
}

// Type-only Storybook import, for the reason Sidebar.stories.tsx records: importing any *value*
// from Storybook breaks the Jest story smoke test with an opaque ESM error, because
// @storybook/nextjs-vite will not load under Jest.
//
// **`parameters.nextjs.appDirectory` is load-bearing and no gate will tell you it is missing.**
// The modal calls `useRouter` for its post-save refresh, and `next/navigation` throws "invariant
// expected app router to be mounted" outside a router. Both CI gates miss it from opposite
// directions - `build-storybook` bundles stories without running one, and
// `screens.stories.test.tsx` renders them under Jest with `next/navigation` already mocked - so
// the story threw in the browser with a green suite and a green build until somebody opened it.
// `frontend/src/app/CLAUDE.md` records that trap.
//
// The modal takes everything as props, so these stories need no provider and no fetch: the
// options are a literal and the action is a stub. `AddTransactionProvider.test.tsx` covers the
// wiring that supplies them for real.

const meta: Meta<typeof AddTransactionModal> = {
  title: 'Screens/09 Add transaction',
  component: AddTransactionModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof AddTransactionModal>;

/** The account's categories, ordered by name as the backend returns them. */
const CATEGORIES = [
  { id: '0198c2a1-0000-7000-8000-0000000000a3', name: 'Dining out' },
  { id: '0198c2a1-0000-7000-8000-0000000000a4', name: 'Entertainment' },
  { id: '0198c2a1-0000-7000-8000-0000000000a1', name: 'Groceries' },
  { id: '0198c2a1-0000-7000-8000-0000000000a5', name: 'Housing' },
  { id: '0198c2a1-0000-7000-8000-0000000000a2', name: 'Transport' },
  { id: '0198c2a1-0000-7000-8000-0000000000ff', name: 'Uncategorized' },
];

/** Accepts everything, so the happy path closes. */
const accept = async () => ({ ok: true }) as const;

/** A stub scan action: these stories are not about PET-59's scanning states, only its controls. */
const scan = async (): Promise<ScanReceiptResult> => ({
  ok: true,
  data: { merchant: null, amount: null, date: null, categoryId: null, note: null, missing: [] },
});

/**
 * The modal as frame 09 draws it (node 28:384).
 *
 * What to diff against Figma is the structure, not the pixels: the box centred over the dimmed
 * page, the Amount field **focused** and carrying its `$` prefix, Date and Merchant sharing a
 * row, and the footer's secondary-then-primary pair. Its width, radius, shadow and focus ring
 * are the theme's as of PET-57, and the frame's two hairline rules are gone with it - a stock
 * daisyUI modal draws none.
 *
 * Two things here have no Figma counterpart and are the ones to actually look at: the Category
 * field opens on a `Select…` placeholder rather than preselecting "Uncategorized", and the Date
 * field is a mini-calendar - click it to see the popover, which the file draws nothing of at all
 * (ADD-7, A14).
 */
export const Default: Story = {
  render: () => (
    <AddTransactionModal categories={CATEGORIES} create={accept} scan={scan} onClose={() => {}} />
  ),
};

/**
 * Every validation message at once, which is the artifact A29 owes a designer.
 *
 * Assumption A29 records that **no form error visual exists anywhere in the Figma file**, so the
 * pattern - daisyUI's `input-error` / `select-error` border plus one `text-error` line, no icon -
 * and all four strings are ours. This story submits an empty form on mount so the four appear
 * together, because what needs reviewing is the treatment of a whole failing form rather than
 * one field.
 *
 * The four post-network failure lines are not shown here: each replaces the others, they need a
 * round trip to provoke, and `AddTransactionModal.test.tsx` pins all four strings.
 */
export const WithMessages: Story = {
  render: () => {
    // A local component so the hook runs inside a render pass. The smoke harness calls
    // `render(args)` outside React, so a hook written directly in here would throw "invalid hook
    // call" in a suite that never opens a browser - the same constraint Shell/Modal's
    // `FromTrigger` story works within.
    function Demo() {
      const host = useRef<HTMLDivElement>(null);

      useEffect(() => {
        // `requestSubmit` rather than clicking, so this goes through the form's own submit path
        // - the one that runs validation - instead of simulating a pointer. The form is the
        // modal's, so it is found by tag rather than by role: a <form> only publishes the `form`
        // role once it has an accessible name.
        host.current?.querySelector('form')?.requestSubmit();
      }, []);

      return (
        <div ref={host}>
          <AddTransactionModal
            categories={CATEGORIES}
            create={accept}
            scan={scan}
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
 * no explanation is worse than a message. Reachable when the session dies or the backend is down
 * between opening the modal and the read landing.
 */
export const CategoriesUnavailable: Story = {
  render: () => (
    <AddTransactionModal
      categories={null}
      categoriesFailed
      create={accept}
      scan={scan}
      onClose={() => {}}
    />
  ),
};
