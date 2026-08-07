import { render, screen } from '@testing-library/react';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { InsightTeaserCard, type InsightTeaserCardProps } from './InsightTeaserCard';

// DSH-9 (node 21:4) and its empty state (node 44:706).
//
// `useAddTransaction` throws outside its provider by design, and the empty state's button calls
// it - the same reason `DashboardScreen.test.tsx` wraps every render.
function renderCard(insight: InsightTeaserCardProps['insight']) {
  return render(
    <AddTransactionProvider>
      <InsightTeaserCard insight={insight} />
    </AddTransactionProvider>,
  );
}

const SUMMARY = {
  headline: 'You are on track this month',
  body: "You've spent $1,240 of your $2,000 budget with 11 days to go.",
};

describe('a ready insight set (AC1, AC2)', () => {
  it('renders the response headline and body verbatim, as a heading and a paragraph', () => {
    renderCard(SUMMARY);

    expect(screen.getByRole('heading', { name: SUMMARY.headline })).toBeInTheDocument();
    expect(screen.getByText(SUMMARY.body)).toBeInTheDocument();
  });

  it('links "Open insights" to the insights route', () => {
    renderCard(SUMMARY);

    expect(screen.getByRole('link', { name: 'Open insights →' })).toHaveAttribute(
      'href',
      '/insights',
    );
  });

  it('renders no Add transaction control in this state', () => {
    renderCard(SUMMARY);

    expect(screen.queryByRole('button', { name: /Add transaction/ })).not.toBeInTheDocument();
  });
});

describe('nothing generated yet (AC3, AC4)', () => {
  it('shows the unlock copy instead of any insight content', () => {
    renderCard(null);

    expect(
      screen.getByRole('heading', { name: 'Insights unlock after your first expense.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Log a few expenses and I'll surface patterns and ways to save."),
    ).toBeInTheDocument();
  });

  it('offers Add transaction instead of a link to insights', () => {
    renderCard(null);

    expect(screen.getByRole('button', { name: 'Add transaction →' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open insights/ })).not.toBeInTheDocument();
  });
});
