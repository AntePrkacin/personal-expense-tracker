import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';

import { MonthPill } from './dashboard/MonthPill';
import { PageHeader } from './PageHeader';
import { SearchPill } from './transactions/SearchPill';

// Type-only Storybook import, for the reason Sidebar.stories.tsx records:
// importing any *value* from Storybook breaks the Jest story smoke test with an
// opaque ESM error, because @storybook/nextjs-vite will not load under Jest.
//
// Filed under "Shell" rather than "Components" because this is not one of the
// nine tiles on the Figma Components page - it is the app shell's own. The four
// stories below are the four real screens, so each one diffs against a whole
// Figma node rather than against a variant of a component.
//
// The sample copy is October 2025, which is the month the entire file is drawn
// in. The running app shows the real current month.

const meta: Meta<typeof PageHeader> = {
  title: 'Shell/Page header',
  component: PageHeader,
  tags: ['autodocs'],
  decorators: [
    // The header is a full-width band with no background of its own; it sits on
    // the body's canvas. The decorator supplies that, since Storybook's own
    // backdrop would hide the distinction from a card surface.
    (Story) => (
      <div className="bg-base-200 w-full">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PageHeader>;

/** 04 Dashboard (node 21:56). The only screen with the month select. */
export const Dashboard: Story = {
  args: {
    overline: 'October 2025',
    title: 'Dashboard',
    action: (
      <>
        <MonthPill label="October" />
        <Button label="Add transaction" />
      </>
    ),
  },
};

/**
 * 06 Transactions (node 26:137). A search field where Dashboard has the month
 * select - the two screens do not share a right-hand control, whatever AC3 says.
 */
export const Transactions: Story = {
  args: {
    overline: 'October 2025',
    title: 'Transactions',
    action: (
      <>
        <SearchPill placeholder="Search transactions" />
        <Button label="Add transaction" />
      </>
    ),
  },
};

/**
 * 14 AI Insights (node 38:542). The overline names the screen's purpose rather
 * than the period, and the action is secondary rather than primary.
 */
export const Insights: Story = {
  args: {
    overline: 'Your money assistant',
    title: 'AI Insights',
    action: <Button label="Regenerate" variant="secondary" />,
  },
};

/** 17 Settings (node 40:677). No action at all, not an empty one. */
export const Settings: Story = {
  args: {
    overline: 'Manage your account',
    title: 'Settings',
  },
};

/**
 * 08 Transaction detail (node 34:349). The second shape: a breadcrumb where the
 * four above draw an overline, and a caption row under the title. PET-34 dropped
 * the frame's "· 2:32 PM" from that caption, because no column stores a time.
 */
export const TransactionDetail: Story = {
  args: {
    breadcrumb: (
      <Link href="/transactions" className="link link-hover text-base-content/60 text-sm">
        All transactions
      </Link>
    ),
    title: 'Whole Foods',
    caption: (
      <>
        <span className="text-base-content/60 text-sm">Oct 8, 2025</span>
        <span className="badge badge-sm badge-ghost gap-1.5">
          <span className="status status-success" aria-hidden="true" />
          Groceries
        </span>
      </>
    ),
    action: (
      <>
        <Button label="Edit" variant="secondary" />
        <Button label="Delete" variant="dangerSoft" />
      </>
    ),
  },
};
