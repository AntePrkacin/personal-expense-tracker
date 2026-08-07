'use client';

import { Button, type ButtonVariant } from '@/components/ui/Button';

import { useAddTransaction } from './AddTransactionProvider';

// The "Add transaction" trigger, wherever it appears.
//
// Four exist today - the Dashboard header, the Dashboard insight teaser's unlock state, the
// Transactions header, and the Transactions empty card (ADD-1, DSH-2, DSH-9, TRN-1, TRN-9) - and
// ADD-1 names one more that has no host UI yet: the AI Insights empty state (INS-7, PET-44). It
// adds a trigger by rendering this and nothing else, exactly as PET-25's teaser did.
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
   * differently: TRN-9's card says "Add transaction" while DSH-9's teaser draws
   * "Add transaction →", which PET-25 passes. INS-7 passes its own when it lands.
   */
  label?: string;
  /** The variant. Primary at all four sites, the teaser included; INS-7 may differ. */
  variant?: ButtonVariant;
};

export function AddTransactionButton({
  label = 'Add transaction',
  variant = 'primary',
}: AddTransactionButtonProps) {
  const { open } = useAddTransaction();

  return <Button label={label} variant={variant} onClick={open} />;
}
