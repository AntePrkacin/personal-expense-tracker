import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';

import { INSIGHTS_TAB_HREFS, INSIGHTS_TABS, InsightsTabs } from './InsightsTabs';

// The assistant's tab bar (PET-73).
//
// The labels are the only thing this file states for itself. The keys come from `INSIGHTS_TABS`
// and the paths from `INSIGHTS_TAB_HREFS`, both the component's own, so no assertion here can
// pass against a table that disagrees with the links it is checking - the mistake
// `SidebarNav.test.tsx` records for its own earlier version, where four hand-written copies of
// the hrefs each asserted themselves against themselves.

const LABELS: Record<(typeof INSIGHTS_TABS)[number], string> = {
  chat: 'Chat',
  history: 'History',
};

const CASES = INSIGHTS_TABS.map((key) => [key, INSIGHTS_TAB_HREFS[key], LABELS[key]] as const);

describe('the table this suite drives', () => {
  it('has a case for every tab', () => {
    // Guards the table above: a shrunken list still passes an it.each over it.
    expect(CASES).toHaveLength(INSIGHTS_TABS.length);
    expect(CASES.map(([key]) => key)).toEqual([...INSIGHTS_TABS]);
  });
});

describe('the route folders behind those hrefs', () => {
  // The one copy of the contract no other test can reach. `lib/routes.test.ts` covers the access
  // screens, `SidebarNav.test.tsx` the four app routes and `TransactionTabs.test.tsx` the
  // categories tab; `/insights/history` is in none of those sets. Without this, renaming the
  // folder 404s the tab with the whole suite green.
  it.each(CASES)('%s has a page at app/(app)%s', (_key, href) => {
    // __dirname is app/(app)/insights/, and href starts with a slash and includes /insights, so
    // resolve from the (app) group rather than from here.
    const page = path.join(__dirname, '..', href, 'page.tsx');

    expect(fs.existsSync(page)).toBe(true);
  });
});

describe('the hrefs themselves', () => {
  it('nests History under the sidebar route, so the sidebar keeps Insights lit', () => {
    // A sibling path would match none of the four sidebar hrefs, fall through to `FALLBACK_ITEM`
    // and light Dashboard while this bar said Insights. `matchItem` matches by prefix with a
    // trailing-slash boundary, so the nesting is what buys that for free.
    expect(INSIGHTS_TAB_HREFS.history.startsWith(`${INSIGHTS_TAB_HREFS.chat}/`)).toBe(true);
  });
});

describe('InsightsTabs', () => {
  it.each(CASES)('points %s at %s', (_key, href, label) => {
    render(<InsightsTabs active="chat" historyCount={null} />);

    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  });

  it.each(CASES)('marks %s current when it is the active tab', (key, _href, label) => {
    render(<InsightsTabs active={key} historyCount={null} />);

    // `aria-current` is the machine-readable half and the **only** half this suite can see. The
    // visible half - a 2px `bg-primary` rule spanning the tab, and the inactive label's
    // `base-content/50` - is hand-written and is not plugin-supplied, so deleting either leaves
    // the bar with no current-page indicator and this assertion still passes. That is the browser
    // walk's, not Jest's.
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
  });

  it('marks only the active tab', () => {
    render(<InsightsTabs active="chat" historyCount={null} />);

    expect(screen.getByRole('link', { name: 'History' })).not.toHaveAttribute('aria-current');
  });

  it('is a navigation, never a tablist', () => {
    // These navigate to separate routes and replace the page, so `role="tab"` would promise a
    // panel relationship that does not exist. The absence is what this pins.
    render(<InsightsTabs active="chat" historyCount={null} />);

    expect(screen.getByRole('navigation', { name: 'Assistant views' })).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('uses no daisyUI tab class, which cannot be themed from the outside', () => {
    // `--tab-border-color` and `--tab-p` are both set at (0,3,0) against a utility's (0,1,0), so
    // a `tab` class here would draw a 3px inset `currentColor` rule that no utility can correct.
    const { container } = render(<InsightsTabs active="chat" historyCount={null} />);

    expect(container.querySelector('.tab, .tabs')).toBeNull();
  });

  // **This block replaced a test asserting the opposite, and the reversal is the point.** It read
  // "carries no count badges", because a badge on Chat would have forced the bare route to fetch a
  // count - true of a count that meant reading the whole session list, which is what existed then.
  // PET-76 added `GET /api/assistant/sessions/count`, so the number costs one integer rather than a
  // list, and the product owner asked for the badge. The old reason expired rather than being
  // overruled; every `historyCount={null}` above is what keeps the rest of this suite testing the
  // bar rather than the pill.
  describe('the History count', () => {
    it('draws a badge on History when the count was read', () => {
      const { container } = render(<InsightsTabs active="history" historyCount={3} />);

      expect(container.querySelectorAll('.badge')).toHaveLength(1);
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('draws none on Chat, which has nothing countable behind it', () => {
      const { container } = render(<InsightsTabs active="chat" historyCount={3} />);

      // The bar is the same component on both routes, so the badge follows the *tab* rather than
      // the active route: Chat never carries one, and History carries one from either side.
      expect(container.querySelectorAll('.badge')).toHaveLength(1);
      expect(screen.getByRole('link', { name: 'History 3' })).toBeInTheDocument();
    });

    it('draws nothing at all when the count could not be read', () => {
      // `null` is a failed read, not an empty account - `readSessionCount` degrades rather than
      // throwing, because a badge must not replace a working chat. A pill reading 0 here would be
      // the failure asserting a fact.
      const { container } = render(<InsightsTabs active="history" historyCount={null} />);

      expect(container.querySelector('.badge')).toBeNull();
      expect(screen.getByRole('link', { name: 'History' })).toBeInTheDocument();
    });

    it('draws a zero for an account with no conversations', () => {
      // The other half of the same distinction, and the case a falsy check gets wrong: `0` is a
      // number that was really read and has to render.
      render(<InsightsTabs active="history" historyCount={0} />);

      expect(screen.getByRole('link', { name: 'History 0' })).toBeInTheDocument();
    });

    it('puts the count inside the tab rather than beside it, so it is not a second tab stop', () => {
      render(<InsightsTabs active="history" historyCount={4} />);

      const link = screen.getByRole('link', { name: 'History 4' });
      expect(link.querySelector('.badge')?.textContent).toBe('4');
      expect(screen.getAllByRole('link')).toHaveLength(2);
    });
  });
});
