import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

import { categoryDotClass } from '@/components/ui/categoryColour';
import { formatIsoDate } from '@/lib/format';
import { moneyFormatters } from '@/lib/money';
import type { TransactionDetail } from '@/lib/transactionDetail';

import { PageHeader } from '../../PageHeader';
import { CategoryContextCard } from './CategoryContextCard';

// 08 Transaction detail (node 34:349).
//
// **Separate from `page.tsx` because the route is async and fetches**, which is the shape
// `/transactions` established and the reason Storybook can render this at all: it takes a
// resolved response and renders it, with no request scope and no mocks.
//
// **Three of the frame's six Details rows are gone, and the header's time with them.** DET-6
// draws Merchant, Category, Date, Time, Payment and Status; DET-8 and A20 record that the last
// three are captured by no form and stored in no column. PET-34's answer is to drop them rather
// than render three permanently blank rows - which is the alternative A20 named and nobody had
// chosen - and the same reasoning takes "· 2:32 PM" out of the caption and "Debited from
// Everyday account" off the amount card. Nothing on this page now names data the app does not
// hold. That removes AC6 rather than meeting it.
//
// **The actions are the page's one client boundary**, in `TransactionDetailActions`. Everything
// here stays a Server Component.

type TransactionDetailScreenProps = {
  detail: TransactionDetail;
  /** `/transactions` plus the filters the user arrived with, for DET-1's breadcrumb. */
  backHref: string;
  /** Just the query string half of it, for the sibling links to carry onward. */
  query: string;
  /** DET-2's Edit and Delete. A slot, because they need the client and this file does not. */
  actions: React.ReactNode;
  /**
   * The profile's currency, threaded from the page rather than read here.
   *
   * A Server Component cannot reach `PreferencesProvider`, which is client-side, so the server
   * half of the app takes the currency as a prop while the client half uses `useMoney()`.
   * `lib/money.ts` records the split.
   */
  currency: string;
};

export function TransactionDetailScreen({
  detail,
  backHref,
  query,
  actions,
  currency,
}: TransactionDetailScreenProps) {
  const { formatNegative } = moneyFormatters(currency);

  const { transaction, category, recentInCategory } = detail;

  // A note that is null, or present but blank, hides the card entirely (A21). Blank is worth
  // treating as absent because `toUpdateTransactionBody` sends `null` for a cleared note but
  // nothing stops a note of "   " existing from an earlier write.
  const note = transaction.note?.trim();

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link
            href={backHref}
            // `outline-solid` beside `outline-2`, without which the ring computes to style
            // `none` and paints nothing: daisyUI's `.link` sets `--tw-outline-style: none` on
            // focus and Tailwind's `outline-2` reads that variable. The trap
            // `frontend/CLAUDE.md` records, and `.link` is the component it names.
            className="link link-hover text-base-content/60 flex w-fit items-center gap-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid"
          >
            <ChevronLeft className="size-3.5 shrink-0" aria-hidden="true" />
            All transactions
          </Link>
        }
        title={transaction.merchant}
        caption={
          <>
            <span className="text-base-content/60 text-sm">{formatIsoDate(transaction.date)}</span>
            {/* `badge-ghost` plus a `status` dot in the category's colour, which is the frame's
                pale chip. `CATEGORY_DOT` rather than the tile class: `status` draws a shadow
                from `currentColor`, so a class pair carrying a `-content` half turns that
                shadow into an opaque smudge. */}
            <span className="badge badge-sm badge-ghost gap-1.5">
              <span aria-hidden="true" className={`status ${categoryDotClass(category.color)}`} />
              {category.name}
            </span>
          </>
        }
        action={actions}
      />

      <main className="flex-1 pb-10">
        {/* Two columns at lg, the frame's 720/360 split rounded to a 2:1 grid; one column
            below it, where the frames draw nothing. The right column's cards come second in
            source order, which is also the order they should be read in. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <section className="card bg-base-100 text-base-content shadow-sm">
              <div className="card-body gap-2">
                <h2 className="text-base-content/60 text-sm font-normal">Amount</h2>
                {/* The one oversized figure on the page (DET-3). `base-content` rather than
                    `text-error`: every transaction in this app is a debit, so a danger colour
                    would mark the normal case as a fault - the same call TransactionRow makes
                    about its AMOUNT column. */}
                <p className="font-display text-5xl font-bold tabular-nums">
                  {formatNegative(transaction.amount)}
                </p>
              </div>
            </section>

            <CategoryContextCard
              currency={currency}
              category={category}
              recentInCategory={recentInCategory}
              query={query}
            />
          </div>

          <div className="flex flex-col gap-5">
            <section className="card bg-base-100 text-base-content shadow-sm">
              <div className="card-body gap-0">
                <h2 className="font-display text-2xl font-semibold">Details</h2>
                {/* A dl rather than a table: these are name/value pairs, not a grid, and a
                    two-column table would need a header row the frame does not draw. */}
                <dl className="mt-3 text-sm">
                  <DetailRow label="Merchant" value={transaction.merchant} />
                  <DetailRow label="Category" value={category.name} />
                  <DetailRow label="Date" value={formatIsoDate(transaction.date)} />
                </dl>
              </div>
            </section>

            {note ? (
              <section className="card bg-base-100 text-base-content shadow-sm">
                <div className="card-body gap-2">
                  <h2 className="font-display text-2xl font-semibold">Note</h2>
                  {/* whitespace-pre-line so a note typed with line breaks keeps them; the
                      textarea that writes it accepts them. */}
                  <p className="text-base-content/70 text-sm whitespace-pre-line">{note}</p>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}

/** One label-value pair in the Details card (DET-6). */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-base-300 flex items-center justify-between gap-4 border-b py-3 last:border-b-0">
      <dt className="text-base-content/60">{label}</dt>
      <dd className="text-end font-semibold">{value}</dd>
    </div>
  );
}
