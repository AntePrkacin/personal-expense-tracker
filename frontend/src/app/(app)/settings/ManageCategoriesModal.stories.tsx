import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { Allocation, Category } from '@/lib/categories';

import { PreferencesProvider } from '../PreferencesProvider';
import {
  category,
  FALLBACK_CATEGORY,
  UNCAPPED_CATEGORY,
} from '../transactions/categories/categoryFixture';
import { DeleteCategoryProvider } from '../transactions/categories/DeleteCategoryProvider';
import { EditCategoryProvider } from '../transactions/categories/EditCategoryProvider';

import { ManageCategoriesModal as Modal } from './ManageCategoriesModal';

/**
 * The modal inside the three things it cannot render without: the shell's currency, and the two
 * providers whose hooks its row actions call.
 *
 * **A wrapper rather than a `decorators` entry, and that is not a style choice.** The story smoke
 * tests build each story from `render` or `meta.component` and never apply a meta's decorators, so a
 * decorator would work in the browser and throw under Jest - the trap `frontend/src/app/CLAUDE.md`
 * records under Storybook.
 *
 * **The nesting order is the app's own**, and it is load-bearing here for the same reason it is
 * there: `EditCategoryProvider` calls `useDeleteCategory()` in its own body, so reversed this throws
 * while rendering rather than on a click. A story that got it wrong would fail loudly, which is
 * exactly what makes keeping the real order here worth doing rather than stubbing both hooks.
 */
function ManageCategoriesModal(props: React.ComponentProps<typeof Modal>) {
  return (
    <PreferencesProvider currency="USD">
      <DeleteCategoryProvider fallbackName="Uncategorized" remove={remove}>
        <EditCategoryProvider palette={null} periods={[]} update={update}>
          <Modal {...props} />
        </EditCategoryProvider>
      </DeleteCategoryProvider>
    </PreferencesProvider>
  );
}

// Type-only Storybook import, for the reason `Sidebar.stories.tsx` records: importing any *value*
// from Storybook breaks the Jest story smoke test with an opaque ESM error.
//
// **`parameters.nextjs.appDirectory` is load-bearing and no gate will tell you it is missing.** The
// sub-modals this one opens call `useRouter` for their post-save refresh, and `next/navigation`
// throws outside a router. `build-storybook` bundles stories without running one and
// `screens.stories.test.tsx` renders them with `next/navigation` already mocked, so a story missing
// it throws in the browser with both gates green.
//
// **There is no Figma frame for this modal**, so these stories are not a diff against a design -
// they are the only place it can be reviewed at all, which puts them in the Allocate modal's
// position rather than frame 19's. The source is the Spendifico Design System's
// `ui_kits/spendifico-app/ManageCategoriesModal.jsx`, and the one deliberate divergence from it is
// visible in every story below: **`Uncategorized` is never a row**, though the source draws its
// "Other" like any other category.
//
// Every action is a stub and must stay one: Storybook's Vite build has no notion of `'use server'`,
// so a real one would reach `cookies()` from `next/headers` in the browser.

const remove = async () => ({ ok: true }) as const;
const update = async () => ({ ok: true }) as const;
const create = async () => ({ ok: true }) as const;
const close = () => {};

const meta: Meta<typeof ManageCategoriesModal> = {
  title: 'Screens/Manage categories',
  component: ManageCategoriesModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
  args: { palette: null, create, onClose: close },
};

export default meta;

type Story = StoryObj<typeof ManageCategoriesModal>;

/** The design system's own account: several capped categories under a $3,200 budget. */
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
    color: 'secondary',
    icon: 'house',
    monthlyCap: 1100,
    spent: 1100,
    status: 'full',
  }),
  FALLBACK_CATEGORY,
];

const ALLOCATION: Allocation = { monthlyBudget: 3200, allocated: 2250, unallocated: 950 };

/** The frame as the source draws it, minus the "Other" row this app deliberately excludes. */
export const Default: Story = {
  args: { categories: CATEGORIES, allocation: ALLOCATION },
  render: (args) => <ManageCategoriesModal {...args} />,
};

/**
 * A category with no cap, which is the state the caption is about.
 *
 * The common case rather than an edge: a cap is optional throughout, and this is what tells the user
 * where one is set at all, since this modal deliberately sets none inline.
 */
export const WithUncapped: Story = {
  args: {
    categories: [category({ name: 'Groceries' }), UNCAPPED_CATEGORY, FALLBACK_CATEGORY],
    allocation: { monthlyBudget: 2000, allocated: 500, unallocated: 1500 },
  },
  render: (args) => <ManageCategoriesModal {...args} />,
};

/**
 * Nothing to manage, which is reachable rather than hypothetical.
 *
 * `Uncategorized` cannot be deleted, so an account that has removed every other category opens the
 * modal on exactly this. Without its sentence it is a column header over an empty box.
 */
export const NoCategories: Story = {
  args: {
    categories: [FALLBACK_CATEGORY],
    allocation: { monthlyBudget: 2000, allocated: 0, unallocated: 2000 },
  },
  render: (args) => <ManageCategoriesModal {...args} />,
};

/**
 * Enough rows to scroll, which is what `max-h-93 overflow-y-auto` bounds.
 *
 * The list scrolls rather than the box, so the summary island and the footer stay put - worth
 * looking at, because the alternative reads as the dialog growing past the viewport.
 */
export const ManyCategories: Story = {
  args: {
    categories: [
      ...CATEGORIES,
      category({ id: 'e1', name: 'Health', color: 'accent', icon: 'heart', monthlyCap: 150 }),
      category({
        id: 'e2',
        name: 'Shopping',
        color: 'warning',
        icon: 'shopping-cart',
        monthlyCap: 250,
      }),
      category({
        id: 'e3',
        name: 'Subscriptions',
        color: 'primary',
        icon: 'credit-card',
        monthlyCap: 60,
      }),
      category({ id: 'e4', name: 'Travel', color: 'info', icon: 'plane', monthlyCap: 400 }),
      category({ id: 'e5', name: 'Pets', color: 'success', icon: 'paw-print', monthlyCap: 80 }),
    ],
    allocation: { monthlyBudget: 3200, allocated: 3190, unallocated: 10 },
  },
  render: (args) => <ManageCategoriesModal {...args} />,
};

/**
 * A long category name against the row's `truncate`, and a fully assigned budget.
 *
 * The bar has no remainder segment at all here, which is the state the source draws with a
 * transparent tail rather than an empty grey one.
 */
export const LongNameFullyAssigned: Story = {
  args: {
    categories: [
      category({ name: 'Household supplies and cleaning products', monthlyCap: 2000, spent: 400 }),
      FALLBACK_CATEGORY,
    ],
    allocation: { monthlyBudget: 2000, allocated: 2000, unallocated: 0 },
  },
  render: (args) => <ManageCategoriesModal {...args} />,
};
