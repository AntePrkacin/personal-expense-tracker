import { Button } from '@/components/ui/Button';
import { monthOverline } from '@/lib/format';

import { PageHeader } from '../PageHeader';
import { SearchPill } from './SearchPill';

// 06 Transactions - List (Figma node 26:90).
//
// PET-19 ships the header only. The All transactions / Categories tabs, the
// filter row and the table are PET-28's and the categories tickets'. Note the
// tabs sit in the content area below rather than in the header (node 26:150),
// which is why CTG-1's "Add category" swapping in for "Add transaction" needs no
// header change: the tab passes a different action.

export default function TransactionsPage() {
  return (
    <>
      <PageHeader
        overline={monthOverline(new Date())}
        title="Transactions"
        action={
          <>
            <SearchPill placeholder="Search transactions" />
            <Button label="Add transaction" />
          </>
        }
      />
      <main className="flex-1 px-4 pb-10 sm:px-6 lg:px-10" />
    </>
  );
}
