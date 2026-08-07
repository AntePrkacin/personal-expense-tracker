import { render, screen } from '@testing-library/react';

import { readTransactionDetail } from '../../../../lib/transactionDetail';
import type { TransactionDetail } from '../../../../lib/transactionDetail';

import TransactionDetailPage from './page';
import TransactionNotFound, { NOT_FOUND_COPY } from './not-found';

// The route's own job, which is small and entirely about the URL: await both promises, parse
// the filters out of the query string, and hand the read's answer down. The read's failure
// policy is `transactionDetail.test.ts`'s and the rendering is the screen's.
//
// Relative specifiers throughout - the `@/` alias is unresolvable to `jest.mock` from
// anywhere, which is the trap `frontend/src/app/CLAUDE.md` records.

jest.mock('../../../../lib/transactionDetail', () => ({
  readTransactionDetail: jest.fn(),
}));

// The actions are a client component reaching two contexts and a router; this suite is about
// the route, so it stands them in rather than mounting three providers.
jest.mock('./TransactionDetailActions', () => ({
  TransactionDetailActions: ({ backHref }: { backHref: string }) => (
    <button type="button" data-back={backHref}>
      Edit
    </button>
  ),
}));

const DETAIL: TransactionDetail = {
  transaction: {
    id: '0198c2a1-0000-7000-8000-000000000001',
    merchant: 'Whole Foods',
    categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
    amount: 62.4,
    date: '2025-10-08',
    note: null,
    createdAt: '2025-10-08T09:00:00.000Z',
    updatedAt: '2025-10-08T09:00:00.000Z',
  },
  category: {
    id: '0198c2a1-0000-7000-8000-0000000000a1',
    name: 'Groceries',
    color: 'success',
    icon: null,
    note: null,
    isFallback: false,
    monthlyCap: 500,
    spent: 397,
    transactionCount: 3,
    percentUsed: 79.4,
    remaining: 103,
    over: null,
    status: 'near',
  },
  recentInCategory: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  (readTransactionDetail as jest.Mock).mockResolvedValue(DETAIL);
});

async function renderPage(id = DETAIL.transaction.id, search = {}) {
  const ui = await TransactionDetailPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(search),
  });

  return render(ui);
}

describe('TransactionDetailPage', () => {
  it('reads the transaction named by the dynamic segment', async () => {
    await renderPage();

    expect(readTransactionDetail).toHaveBeenCalledWith(DETAIL.transaction.id);
  });

  it('makes exactly one read', async () => {
    // One request for three cards' worth of data. A second call here would mean somebody
    // reached for lib/categories.ts to build the chip.
    await renderPage();

    expect(readTransactionDetail).toHaveBeenCalledTimes(1);
  });

  it('renders the screen for what came back', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Whole Foods' })).toBeInTheDocument();
  });

  it('points the breadcrumb at the bare list when no filters arrived', async () => {
    await renderPage();

    expect(screen.getByRole('link', { name: 'All transactions' })).toHaveAttribute(
      'href',
      '/transactions',
    );
  });

  it('carries the filters it arrived with back to the list', async () => {
    await renderPage(DETAIL.transaction.id, { period: 'all', sort: 'date_asc' });

    expect(screen.getByRole('link', { name: 'All transactions' })).toHaveAttribute(
      'href',
      '/transactions?period=all&sort=date_asc',
    );
  });

  it('drops a filter value the list would have 400d on', async () => {
    // `parseTransactionFilters` validates rather than forwards. On the list a bad `sort`
    // reaches the API and replaces the screen with an error page; here it costs the user
    // their sort and nothing else.
    await renderPage(DETAIL.transaction.id, { sort: 'lol', period: 'all' });

    expect(screen.getByRole('link', { name: 'All transactions' })).toHaveAttribute(
      'href',
      '/transactions?period=all',
    );
  });

  it('hands Delete the same destination as the breadcrumb', async () => {
    await renderPage(DETAIL.transaction.id, { period: 'previous' });

    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute(
      'data-back',
      '/transactions?period=previous',
    );
  });

  it('round-trips an explicit default rather than canonicalising it away', async () => {
    // `filters.ts` writes a default as the *absent* key, but that rule belongs to the filter
    // controls, which reset by passing `undefined`. The parser validates and does not strip,
    // so `?period=current` survives - which is what the breadcrumb wants: it returns the user
    // to the URL they came from, character for character, rather than to a tidier one.
    await renderPage(DETAIL.transaction.id, { period: 'current' });

    expect(screen.getByRole('link', { name: 'All transactions' })).toHaveAttribute(
      'href',
      '/transactions?period=current',
    );
  });
});

describe('the not-found boundary', () => {
  it('renders the copy and a way back to the list', () => {
    // Rendered by Next when `readTransactionDetail` calls notFound(). Scoped to this segment
    // so it appears inside the shell rather than replacing the whole page.
    render(<TransactionNotFound />);

    expect(screen.getByRole('heading', { name: NOT_FOUND_COPY.heading })).toBeInTheDocument();
    expect(screen.getByText(NOT_FOUND_COPY.body)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: NOT_FOUND_COPY.action })).toHaveAttribute(
      'href',
      '/transactions',
    );
  });

  it('does not claim the page is broken', () => {
    // The distinction the `missing` arm exists to draw. This state is an ordinary outcome.
    const { container } = render(<TransactionNotFound />);

    expect(container.textContent).not.toMatch(/error|wrong|failed/i);
  });

  it('gives the page a level-1 heading, since it replaces the header too', () => {
    // A code review found this shipping with an `h2` as its topmost heading. Every other
    // EmptyState sits under a PageHeader that owns the h1; a not-found boundary replaces the
    // whole route, so it has to carry its own. `(app)/pages.test.tsx`'s one-h1-per-screen
    // sweep never reaches a not-found boundary, so nothing else would catch it.
    render(<TransactionNotFound />);

    expect(
      screen.getByRole('heading', { level: 1, name: NOT_FOUND_COPY.heading }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });
});
