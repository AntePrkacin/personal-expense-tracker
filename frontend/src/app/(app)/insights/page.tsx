import { Button } from '@/components/ui/Button';

import { PageHeader } from '../PageHeader';

// 14 AI Insights (Figma node 38:495).
//
// The one screen whose overline is not the period: "Your money assistant"
// (INS-1). Its action is a *secondary* "Regenerate", which the PET-19 ticket
// text omits entirely but both INS-1 and the frame draw.
//
// PET-19 ships the header only. The October summary card, the four insight
// cards, the "Generating..." in-flight label (15) and the empty state that hides
// this button altogether (16) are the insights ticket's.

export default function InsightsPage() {
  return (
    <>
      <PageHeader
        overline="Your money assistant"
        title="AI Insights"
        action={<Button label="Regenerate" variant="secondary" />}
      />
      <main className="flex-1 px-4 pb-10 sm:px-6 lg:px-10" />
    </>
  );
}
