import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';

import { TAB_HREFS, TRANSACTION_TABS, TransactionTabs } from './TransactionTabs';

// The tab bar, real for the first time as of PET-36.
//
// The labels are the only thing this file states for itself. The keys come from
// `TRANSACTION_TABS` and the paths from `TAB_HREFS`, both the component's own, so no assertion
// here can pass against a table that disagrees with the links it is checking - the mistake
// `SidebarNav.test.tsx` records for its own earlier version, where four hand-written copies of
// the hrefs each asserted themselves against themselves.

const LABELS: Record<(typeof TRANSACTION_TABS)[number], string> = {
  transactions: 'All transactions',
  categories: 'Categories',
};

const CASES = TRANSACTION_TABS.map((key) => [key, TAB_HREFS[key], LABELS[key]] as const);

const COUNTS = { transactionCount: 128, categoryCount: 8 };

describe('the table this suite drives', () => {
  it('has a case for every tab', () => {
    // Guards the table above: a shrunken list still passes an it.each over it.
    expect(CASES).toHaveLength(TRANSACTION_TABS.length);
    expect(CASES.map(([key]) => key)).toEqual([...TRANSACTION_TABS]);
  });
});

describe('the route folders behind those hrefs', () => {
  // The one copy of the contract no other test can reach, and the reason it matters here as
  // much as it does for the sidebar: `lib/routes.test.ts` covers the access screens and
  // `SidebarNav.test.tsx` the four app routes, and `/transactions/categories` is in neither
  // set - it is the app's first route that is not a sidebar destination. Without this, renaming
  // the folder 404s the tab with the whole suite green.
  it.each(CASES)('%s has a page at app/(app)%s', (_key, href) => {
    // __dirname is app/(app)/transactions/, and href starts with a slash and includes
    // /transactions, so resolve from the (app) group rather than from here.
    const page = path.join(__dirname, '..', href, 'page.tsx');

    expect(fs.existsSync(page)).toBe(true);
  });
});

describe('TransactionTabs', () => {
  it.each(CASES)('points %s at %s', (_key, href, label) => {
    render(<TransactionTabs active="transactions" {...COUNTS} />);

    expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('href', href);
  });

  it.each(CASES)('marks %s current when it is the active tab', (key, _href, label) => {
    render(<TransactionTabs active={key} {...COUNTS} />);

    // aria-current is the machine-readable half and the **only** half this suite can see. The
    // visible half - a 2px `bg-primary` rule spanning the tab, and the inactive label's
    // `base-content/50` - is hand-written in `TransactionTabs.tsx` and is not plugin-supplied,
    // so deleting either leaves the bar with no current-page indicator and this assertion still
    // passing. The browser walk measures the rule's height, span, position and colour.
    expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it.each(CASES)('marks nothing else current on %s', (key, _href, label) => {
    render(<TransactionTabs active={key} {...COUNTS} />);

    const others = CASES.filter(([otherKey]) => otherKey !== key);

    expect(others).not.toHaveLength(0);
    expect(label).toBeTruthy();

    for (const [, , otherLabel] of others) {
      expect(screen.getByRole('link', { name: new RegExp(otherLabel) })).not.toHaveAttribute(
        'aria-current',
      );
    }
  });

  it('is a navigation rather than a tablist', () => {
    // These navigate between two routes instead of swapping a panel in place, so `role="tab"`
    // would promise an `aria-controls` relationship to a `tabpanel` that does not exist. Note
    // the bar carries no daisyUI `tab`/`tabs` class either - `tabs-border`'s underline is 3px,
    // `currentColor` and inset by the tab's padding, which is a different design from the one
    // this screen draws, and neither value is reachable from a utility.
    render(<TransactionTabs active="categories" {...COUNTS} />);

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Transaction views' })).toBeInTheDocument();
  });

  it('shows both counts whichever tab is active', () => {
    // The requirement that made this component take two numbers. Frame 13 draws
    // "All transactions 128" beside "Categories 8" while the Categories tab is the one open.
    render(<TransactionTabs active="categories" {...COUNTS} />);

    expect(screen.getByText('All transactions').parentElement).toContainElement(
      screen.getByText('128'),
    );
    expect(screen.getByText('Categories').parentElement).toContainElement(screen.getByText('8'));
  });

  it('keeps the list route the caller asks for, filters and all', () => {
    // **The regression this replaced was silent and cost the user their whole view.** The active
    // tab is how a filtering user says "back to the list"; pointing it at the bare route emptied
    // the search box and reset the period on the one click that means "stay here".
    render(
      <TransactionTabs
        active="transactions"
        {...COUNTS}
        transactionsHref="/transactions?search=Uber&period=all"
      />,
    );

    expect(screen.getByRole('link', { name: /All transactions/ })).toHaveAttribute(
      'href',
      '/transactions?search=Uber&period=all',
    );
  });

  it('leaves the Categories tab bare even when the list carries filters', () => {
    // The other direction, and deliberately not symmetric: that screen has no filter bar, so a
    // forwarded search term would sit in the URL of a page that cannot show it.
    render(
      <TransactionTabs
        active="transactions"
        {...COUNTS}
        transactionsHref="/transactions?search=Uber"
      />,
    );

    expect(screen.getByRole('link', { name: /Categories/ })).toHaveAttribute(
      'href',
      '/transactions/categories',
    );
  });

  it('falls back to the bare list route when no href is given', () => {
    // What `/transactions/categories` renders: it holds no filters, so there is nothing to keep.
    render(<TransactionTabs active="categories" {...COUNTS} />);

    expect(screen.getByRole('link', { name: /All transactions/ })).toHaveAttribute(
      'href',
      '/transactions',
    );
  });

  it('prints a zero count rather than hiding the badge', () => {
    // `total` is the count after filters, so 0 is an ordinary answer on a filtered list and the
    // badge has to say so - the empty and no-results states both render this bar.
    render(<TransactionTabs active="transactions" transactionCount={0} categoryCount={1} />);

    expect(screen.getByText('All transactions').parentElement).toContainElement(
      screen.getByText('0'),
    );
  });
});
