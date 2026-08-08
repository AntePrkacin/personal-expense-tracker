import { render, screen, within } from '@testing-library/react';

import type { CategoryContext, TransactionDetail } from '../../../../lib/transactionDetail';

import { CategoryContextCard } from './CategoryContextCard';

// DET-4 and DET-5. The four states worth pinning are the two the frame draws nothing for -
// uncapped and over budget - plus the capped case it does draw, plus an empty sibling list.

const CAPPED: CategoryContext = {
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
};

const UNCAPPED: CategoryContext = {
  ...CAPPED,
  name: 'Uncategorized',
  color: 'warning-content',
  isFallback: true,
  monthlyCap: null,
  percentUsed: null,
  remaining: null,
  over: null,
  status: 'uncapped',
};

const OVER: CategoryContext = {
  ...CAPPED,
  spent: 620,
  percentUsed: 124,
  remaining: null,
  over: 120,
  status: 'over',
};

const SIBLINGS: TransactionDetail['recentInCategory'] = [
  {
    id: '0198c2a1-0000-7000-8000-000000000002',
    merchant: "Trader Joe's",
    categoryId: CAPPED.id,
    amount: 44.1,
    date: '2025-10-03',
    note: null,
    createdAt: '2025-10-03T09:00:00.000Z',
    updatedAt: '2025-10-03T09:00:00.000Z',
  },
  {
    id: '0198c2a1-0000-7000-8000-000000000003',
    merchant: 'Costco',
    categoryId: CAPPED.id,
    amount: 128.9,
    date: '2025-09-28',
    note: null,
    createdAt: '2025-09-28T09:00:00.000Z',
    updatedAt: '2025-09-28T09:00:00.000Z',
  },
];

function renderCard(category: CategoryContext, recent = SIBLINGS, query = '') {
  return render(
    <CategoryContextCard category={category} recentInCategory={recent} query={query} />,
  );
}

describe('a capped category (AC3)', () => {
  it('titles the card with the category and the period', () => {
    renderCard(CAPPED);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Groceries this month' }),
    ).toBeInTheDocument();
  });

  it('shows the floored percentage in the chip', () => {
    // 79.4 unrounded from the backend, printed as 79 so it cannot disagree with `near`.
    renderCard(CAPPED);

    expect(screen.getByText('79% used')).toBeInTheDocument();
  });

  it('shows the spent figure and the remainder against the cap', () => {
    renderCard(CAPPED);

    expect(screen.getByText('$397.00 spent')).toBeInTheDocument();
    expect(screen.getByText('$103.00 left of $500.00')).toBeInTheDocument();
  });

  it('draws the bar without announcing it as a progressbar', () => {
    // Every figure the bar encodes is already text beside it, so an announced progressbar
    // would restate all three. Also keeps WelcomeScreen's "the app's only progressbar" pin
    // true.
    renderCard(CAPPED);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

describe('an uncapped category', () => {
  // The common case, and no frame draws it. PET-34's answer is to render none of the budget
  // furniture rather than to explain its absence.

  it('shows no chip', () => {
    renderCard(UNCAPPED);

    expect(screen.queryByText(/% used/)).not.toBeInTheDocument();
  });

  it('shows no remaining-of-cap line', () => {
    renderCard(UNCAPPED);

    expect(screen.queryByText(/left of/)).not.toBeInTheDocument();
    expect(screen.queryByText(/over/)).not.toBeInTheDocument();
  });

  it('still shows the spent figure, which is true with or without a cap', () => {
    renderCard(UNCAPPED);

    expect(screen.getByText('$397.00 spent')).toBeInTheDocument();
  });

  it('still shows the whole recent list', () => {
    // The half of the card that has nothing to do with a budget.
    renderCard(UNCAPPED);

    expect(screen.getByRole('link', { name: "Trader Joe's" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Costco' })).toBeInTheDocument();
  });
});

describe('a category over its cap', () => {
  it('names the excess rather than a negative remainder', () => {
    // `remaining` is null once a category is over and `over` carries the excess, so a card
    // reading `remaining` alone would print "$0.00 left of $500.00".
    renderCard(OVER);

    expect(screen.getByText('$120.00 over $500.00')).toBeInTheDocument();
    expect(screen.queryByText(/left of/)).not.toBeInTheDocument();
  });

  it('prints the real percentage in the chip', () => {
    renderCard(OVER);

    expect(screen.getByText('124% used')).toBeInTheDocument();
  });
});

describe('the recent list (AC4)', () => {
  it('lists the siblings in the order the backend sent them', () => {
    // Newest first is the backend's ordering, including across a month boundary - Sep 28
    // follows Oct 3. Rendering must not re-sort it.
    renderCard(CAPPED);

    const names = screen.getAllByRole('link').map((link) => link.textContent);
    expect(names).toEqual(["Trader Joe's", 'Costco']);
  });

  it('captions each row with the category and the short date', () => {
    renderCard(CAPPED);

    expect(screen.getByText('Groceries · Oct 3')).toBeInTheDocument();
    expect(screen.getByText('Groceries · Sep 28')).toBeInTheDocument();
  });

  it('links the merchant alone, not the whole row', () => {
    // frontend/src/app/CLAUDE.md's rule for the table's rows, applied here: a row-wide link
    // would announce as "Trader Joe's Groceries · Oct 3 −$44.10".
    renderCard(CAPPED);

    const link = screen.getByRole('link', { name: "Trader Joe's" });
    expect(link).toHaveAttribute('href', '/transactions/0198c2a1-0000-7000-8000-000000000002');
  });

  it('carries the list filters onto each sibling link', () => {
    renderCard(CAPPED, SIBLINGS, '?period=all&categoryId=abc');

    expect(screen.getByRole('link', { name: 'Costco' })).toHaveAttribute(
      'href',
      '/transactions/0198c2a1-0000-7000-8000-000000000003?period=all&categoryId=abc',
    );
  });

  it('shows each amount as a debit', () => {
    renderCard(CAPPED);

    const list = screen.getByRole('list');
    expect(within(list).getByText('−$44.10')).toBeInTheDocument();
    expect(within(list).getByText('−$128.90')).toBeInTheDocument();
  });

  it('says so when there is nothing else in the category', () => {
    // Reached whenever a category holds exactly one transaction, because the backend excludes
    // the one being viewed. Copy is ours and owes A29 sign-off.
    renderCard(CAPPED, []);

    expect(screen.getByText('Nothing else in Groceries yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
