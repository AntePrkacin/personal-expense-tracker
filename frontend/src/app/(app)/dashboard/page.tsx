import { monthLabel, monthOverline } from '@/lib/format';

import { AddTransactionButton } from '../AddTransactionButton';
import { PageHeader } from '../PageHeader';
import { MonthPill } from './MonthPill';

// 04 Dashboard (Figma node 21:4), and 05 in its empty state.
//
// PET-19 ships the header only. The budget card, the spending trend, the
// category donut, the recent transactions list and the insights teaser are the
// dashboard tickets'; the shell below is where they land.

export default function DashboardPage() {
  // The server clock. The layout's `cookies()` read is what keeps this segment
  // dynamic, so this is evaluated per request rather than once at build time.
  const now = new Date();

  return (
    <>
      <PageHeader
        overline={monthOverline(now)}
        title="Dashboard"
        action={
          <>
            <MonthPill label={monthLabel(now)} />
            {/* Opens modal 09, as of PET-31. The trigger is a thin client wrapper so this page
                can stay a Server Component: a Server Component cannot hand `ui/Button` an
                onClick, and the modal itself lives once on the shell's layout. */}
            <AddTransactionButton />
          </>
        }
      />
      <main className="flex-1 pb-10" />
    </>
  );
}
