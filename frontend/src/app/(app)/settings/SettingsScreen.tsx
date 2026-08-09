import type { Profile } from '@/lib/profile';
import type { updateProfile, UpdateProfileResult } from '@/lib/updateProfile';

import { PageHeader } from '../PageHeader';

import { SettingsForm } from './SettingsForm';

// 17 Settings (frame `40:630`), the fourth and last routed view to get content under its header.
//
// **Synchronous, and a separate file from `page.tsx`, which is a requirement rather than a
// preference.** Storybook cannot render an async Server Component that reads cookies, and the story
// harness builds each story from `render` or `meta.component` while never applying a meta's
// decorators - so a screen that fetched for itself could not have a story at all. `page.tsx` awaits
// `requireProfile()` and hands the result down; this takes the whole state as required props. Same
// shape as `TransactionsScreen`, `DashboardScreen`, `InsightsScreen` and `CategoriesScreen`.
//
// **No `action` on `PageHeader`, which is SET-1's AC2**: this is the only one of the four routed
// views with no header control at all, because "Save changes" lives at the foot of the form. An
// omitted prop is what makes the header render nothing on the right rather than an empty box.

type SettingsScreenProps = {
  profile: Profile;
  /**
   * Threaded through to the form, which is where the reasoning lives: Storybook bundles a
   * `'use server'` module as an ordinary one, so a story pressing Save would reach `cookies()` in
   * the browser. The default is the real action, so `page.tsx` passes nothing.
   */
  save?: (body: Parameters<typeof updateProfile>[0]) => Promise<UpdateProfileResult>;
};

export function SettingsScreen({ profile, save }: SettingsScreenProps) {
  return (
    <>
      <PageHeader overline="Manage your account" title="Settings" />
      <main className="flex-1 pb-10">
        <SettingsForm profile={profile} save={save} />
      </main>
    </>
  );
}
