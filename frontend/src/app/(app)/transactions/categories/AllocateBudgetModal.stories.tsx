import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { Allocation, Category } from '@/lib/categories';

import { PreferencesProvider } from '../../PreferencesProvider';
import { AllocateBudgetModal as Modal } from './AllocateBudgetModal';
import { category, FALLBACK_CATEGORY, UNCAPPED_CATEGORY } from './categoryFixture';

/**
 * The modal inside the shell's preferences, which is what gives it a currency to format with.
 *
 * **A wrapper rather than a `decorators` entry, and that is not a style choice.** The story smoke
 * tests build each story from `render` or `meta.component` and never apply a meta's decorators, so
 * a decorator would work in the browser and throw under Jest - the trap
 * `frontend/src/app/CLAUDE.md` records under Storybook. Wrapping the component itself keeps all
 * seven story bodies below unchanged and keeps both gates honest.
 */
function AllocateBudgetModal(props: React.ComponentProps<typeof Modal>) {
  return (
    <PreferencesProvider currency="USD" monthStartDay={1}>
      <Modal {...props} />
    </PreferencesProvider>
  );
}

// Type-only Storybook import, for the reason `Sidebar.stories.tsx` records: importing any *value*
// from Storybook breaks the Jest story smoke test with an opaque ESM error, because
// @storybook/nextjs-vite will not load under Jest.
//
// **`parameters.nextjs.appDirectory` is load-bearing and no gate will tell you it is missing.** The
// modal calls `useRouter` for its post-save refresh, and `next/navigation` throws "invariant expected
// app router to be mounted" outside a router. Both CI gates miss it from opposite directions -
// `build-storybook` bundles stories without running one, and `screens.stories.test.tsx` renders them
// under Jest with `next/navigation` already mocked - so the story throws in the browser with a green
// suite and a green build until somebody opens it.
//
// **There is no Figma frame for this modal**, so unlike every other module in this section these
// stories are not a diff against a design - they are the *only* place it can be reviewed at all,
// which puts them in `Screens/Verify link failed`'s and `ErrorScreen`'s position rather than frame
// 19's. Five of the seven exist for a designer to answer something specific: `NearlyFullyAllocated`
// for the snap, `WithReservedFallbackCap` for a segment the UI cannot itself create, `TinySegments`
// for a proportion too small to draw, `ManyCategories` for the internal scroll, and
// `NothingToAllocate` for the account with no allocatable category at all - which was **missing**
// until a review of PET-70 found that state reachable and undrawn.
//
// The modal takes everything as props, so these need no provider and no fetch. `save` is a stub, and
// it must stay one: Storybook's Vite build has no notion of `'use server'`, so the real action would
// reach `cookies()` from `next/headers` in the browser.

const meta: Meta<typeof AllocateBudgetModal> = {
  title: 'Screens/Allocate budget',
  component: AllocateBudgetModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof AllocateBudgetModal>;

const accept = async () => ({ ok: true }) as const;
const close = () => {};

/** Frame 13's own cards, which is what the tab behind this modal draws. */
const CATEGORIES: Category[] = [
  category({ name: 'Groceries', monthlyCap: 500, spent: 397 }),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000d2',
    name: 'Dining out',
    color: 'error',
    icon: 'utensils',
    monthlyCap: 300,
    spent: 312,
    status: 'over',
    remaining: null,
    over: 12,
  }),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000d3',
    name: 'Transport',
    color: 'info',
    icon: 'bus',
    monthlyCap: 350,
    spent: 223,
  }),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000d4',
    name: 'Housing',
    color: 'accent',
    icon: 'house',
    monthlyCap: 1100,
    spent: 1100,
    status: 'full',
  }),
  UNCAPPED_CATEGORY,
  FALLBACK_CATEGORY,
];

const allocation = (overrides: Partial<Allocation> = {}): Allocation => ({
  monthlyBudget: 3200,
  allocated: 2250,
  unallocated: 950,
  ...overrides,
});

/**
 * The modal as designed: room left to assign, one row already over its own cap.
 *
 * What to look at. The two islands over the modal's own canvas, the headline amount beside the
 * three-line ledger, and the segmented bar spanning both. "Dining out" is the row whose caption
 * turns danger-toned, because $312 is spent against a $300 cap. `Uncategorized` is deliberately
 * **not** a row - it can be neither renamed nor capped from this UI, which is a limitation this
 * modal extends rather than introduces.
 */
export const Default: Story = {
  render: () => (
    <AllocateBudgetModal
      categories={CATEGORIES}
      allocation={allocation()}
      save={accept}
      onClose={close}
    />
  ),
};

/**
 * A penny left to assign, so the very first keystroke snaps.
 *
 * **This is the state to put in front of a designer first.** Type anything into a field and the
 * value is rewritten to the remainder under the caret, with the footer hint replaced for ~3.4
 * seconds by "Capped at ... the rest of your ... is assigned elsewhere." Nothing in the design system
 * draws that message, and the whole never-go-negative rule is what it exists to explain.
 *
 * Note the mixed precision in it, which is deliberate: the capped figure carries cents because it has
 * to match the field beside it, while the budget is whole because it has to match the summary card
 * behind the modal.
 */
export const NearlyFullyAllocated: Story = {
  render: () => (
    <AllocateBudgetModal
      categories={CATEGORIES}
      allocation={allocation({ allocated: 3199.99, unallocated: 0.01 })}
      save={accept}
      onClose={close}
    />
  ),
};

/**
 * The fallback holds a cap, so part of the budget is spoken for by a row that is not drawn.
 *
 * The leading neutral segment on the bar is that cap, and "Assigned to categories" counts it. Reached
 * only through the API - no control in this app can set it - and it is why the reserved figure is
 * derived from `allocation.allocated` rather than assumed to be zero. Without the segment the bar
 * would contradict "Left to assign".
 */
export const WithReservedFallbackCap: Story = {
  render: () => (
    <AllocateBudgetModal
      categories={[...CATEGORIES.slice(0, 5), { ...FALLBACK_CATEGORY, monthlyCap: 200 }]}
      allocation={allocation({ allocated: 2450, unallocated: 750 })}
      save={accept}
      onClose={close}
    />
  ),
};

/**
 * A $1 cap against a $3,200 budget, which is 0.03% of the bar.
 *
 * **An open question rather than a finished state.** At the modal's width that segment is a fraction
 * of a pixel and renders as nothing. The obvious floor, a minimum width per segment, was rejected
 * because it pushes the widths past 100% and flex then shrinks the *large* segments to fit - the bar
 * would stop being accurate everywhere to make one invisible segment visible. A designer may prefer
 * that trade; this story is where to decide.
 */
export const TinySegments: Story = {
  render: () => (
    <AllocateBudgetModal
      categories={[
        category({ name: 'Stamps', monthlyCap: 1, spent: 0 }),
        category({
          id: '0198c2a1-0000-7000-8000-0000000000e2',
          name: 'Housing',
          color: 'accent',
          monthlyCap: 1100,
          spent: 900,
        }),
      ]}
      allocation={allocation({ allocated: 1101, unallocated: 2099 })}
      save={accept}
      onClose={close}
    />
  ),
};

/**
 * Twelve rows, past the point the list starts scrolling inside the modal.
 *
 * What to check in a browser: the list scrolls on its own while the summary island and the footer
 * stay put, a scroll at the end of the list does not chain out to the box behind it, and tabbing to a
 * field below the fold scrolls it into view without clipping its focus ring.
 */
export const ManyCategories: Story = {
  render: () => (
    <AllocateBudgetModal
      categories={Array.from({ length: 12 }, (_, index) =>
        category({
          id: `0198c2a1-0000-7000-8000-00000000f${index.toString(16)}0`,
          name: `Category ${index + 1}`,
          monthlyCap: 150 + index * 10,
          spent: 40 + index * 15,
        }),
      )}
      allocation={allocation({ allocated: 2460, unallocated: 740 })}
      save={accept}
      onClose={close}
    />
  ),
};

/**
 * Nothing to allocate to, which is a real account rather than a hypothetical one.
 *
 * `Uncategorized` is not a row here and `DELETE /api/categories/:id` refuses to remove it, so an
 * account that has deleted every other category reaches this: the summary card reports the whole
 * budget unassigned, draws the Allocate banner, and the modal behind it has no fields. **A review of
 * PET-70 found it shipping as a column header over an empty box beside a Save that could never
 * enable**, with nothing on screen saying why - so the island is one sentence now and the footer hint
 * is suppressed, since it is advice about fields that are not there. Its copy is invented like the
 * rest and joins what A29 owes.
 */
export const NothingToAllocate: Story = {
  render: () => (
    <AllocateBudgetModal
      categories={[FALLBACK_CATEGORY]}
      allocation={allocation({ allocated: 0, unallocated: 3200 })}
      save={accept}
      onClose={close}
    />
  ),
};

/**
 * Both message treatments at once, which no interaction can produce.
 *
 * The A29 artifact for this modal: a per-row validation line under one field and the form-level
 * failure line under the footer hint. Reached here by handing the modal a failing `save` and a row
 * whose cap is zero - press "Save caps" to see the row message, and fix it and press again to see the
 * failure. Both strings are invented, like everything else in this modal.
 */
export const WithMessages: Story = {
  render: () => (
    <AllocateBudgetModal
      categories={CATEGORIES}
      allocation={allocation()}
      save={async () => ({ ok: false, reason: 'failed' }) as const}
      onClose={close}
    />
  ),
};
