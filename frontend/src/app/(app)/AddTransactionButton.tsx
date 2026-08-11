'use client';

import { Button, type ButtonVariant } from '@/components/ui/Button';

import { useAddTransaction } from './AddTransactionProvider';

// The "Add transaction" trigger, wherever it appears.
//
// Four exist today - the Dashboard header, the Dashboard summary banner's unlock state, the
// Transactions header, and the Transactions empty card (ADD-1, DSH-2, DSH-9, TRN-1, TRN-9).
//
// **This comment named a fifth for two tickets and it is gone rather than built.** ADD-1's AI
// Insights empty state (INS-7) landed at PET-42-43-44 and PET-73 deleted the screen it was on:
// `/insights` is a chat now, and its own empty state offers a question rather than a transaction.
// The Dashboard site is also no longer the teaser's - `InsightTeaserCard` was deleted with
// `DashboardResponseDto.insight`, and `dashboard/InsightSummarySlot.tsx` renders the trigger in
// its place, still by rendering this and nothing else.
//
// **A component rather than an `onClick` written out at each site**, for one reason worth
// stating: the `'use client'` boundary. Every host is a Server Component, and a Server
// Component cannot pass a function to `ui/Button` - so without this wrapper each of them would
// have to become a client component, dragging the whole Transactions screen and both page
// headers into the client bundle to make one button work.

type AddTransactionButtonProps = {
  /**
   * The visible label.
   *
   * A prop with a default rather than a hard-coded string, because the empty states draw it
   * differently: TRN-9's card says "Add transaction" while the Dashboard's summary banner draws
   * "Add transaction →", which `InsightSummarySlot` passes.
   */
  label?: string;
  /** The variant. Primary at all four sites, the summary banner included. */
  variant?: ButtonVariant;
};

export function AddTransactionButton({
  label = 'Add transaction',
  variant = 'primary',
}: AddTransactionButtonProps) {
  const { open } = useAddTransaction();

  return <Button label={label} variant={variant} onClick={open} />;
}
