import { FileQuestion } from 'lucide-react';

import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/Button';
import { SIDEBAR_HREFS } from '@/components/ui/Sidebar';

// What `readTransactionDetail` renders when the backend answers 404.
//
// **The app's first `not-found.tsx`, and it is scoped to this segment deliberately.** Placed
// here rather than at the root it renders inside the `(app)` shell, so a user who followed a
// stale link keeps the sidebar and a way out; at the root it would replace the whole page and
// leave them nowhere. There is still no `error.tsx` anywhere - `frontend/src/app/CLAUDE.md`
// records that, and this does not change it: a backend that cannot answer still throws.
//
// **Reached only by a well-formed id that names nothing**, which is the common case worth
// designing for: a bookmark to a transaction since deleted, or a second tab still holding the
// link after the first deleted it. A malformed id is a 400 and still gets the error page,
// because the two mean genuinely different things.
//
// The frame draws none of this. All three strings are ours and owe A29 sign-off; `docs/TODO.md`
// carries them. The glyph is lucide's, per the icon rule - no traced SVG.
//
// The href cannot carry the filters the user arrived with: a not-found boundary receives no
// props and cannot read `searchParams`. Back to the unfiltered list is the honest fallback,
// and it is one click from where they were.

export const NOT_FOUND_COPY = {
  heading: 'That transaction is gone',
  body: 'It may have been deleted. Everything else is still on your transactions list.',
  action: 'Back to transactions',
} as const;

export default function TransactionNotFound() {
  return (
    <main className="flex-1 pt-6 pb-10">
      <EmptyState
        icon={<FileQuestion className="size-7.5" aria-hidden="true" />}
        heading={NOT_FOUND_COPY.heading}
        body={NOT_FOUND_COPY.body}
        action={<Button label={NOT_FOUND_COPY.action} href={SIDEBAR_HREFS.transactions} />}
      />
    </main>
  );
}
