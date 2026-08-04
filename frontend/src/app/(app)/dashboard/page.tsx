import { Button } from '@/components/ui/Button';
import { monthLabel, monthOverline } from '@/lib/format';

import { PageHeader } from '../PageHeader';
import { MonthPill } from './MonthPill';

// 04 Dashboard (Figma node 21:4), and 05 in its empty state.
//
// PET-19 ships the header only. The budget card, the spending trend, the
// category donut, the recent transactions list and the insights teaser are the
// dashboard tickets'; the shell below is where they land.

export default function DashboardPage() {
  // The server clock. `force-dynamic` on the (app) layout is what stops this
  // being evaluated once at build time.
  const now = new Date();

  return (
    <>
      <PageHeader
        overline={monthOverline(now)}
        title="Dashboard"
        action={
          <>
            <MonthPill label={monthLabel(now)} />
            {/* No onClick: "Add transaction" opens modal 09, which is its own
                ticket. The button is drawn and reachable, and does nothing. */}
            <Button label="Add transaction" />
          </>
        }
      />
      <main className="flex-1 px-10 pb-10" />
    </>
  );
}
