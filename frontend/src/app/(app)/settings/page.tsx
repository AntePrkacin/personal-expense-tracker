import { PageHeader } from '../PageHeader';

// 17 Settings (Figma node 40:630).
//
// The only screen with no header action at all (SET-1, AC2) - "Save changes"
// lives at the bottom of the form, not in the header. So no `action` prop, which
// is what makes PageHeader render nothing on the right rather than an empty box.
//
// PET-19 ships the header only. The Profile card, Preferences, the Categories
// summary and "Save changes" are PET-46's and PET-47's, and they need PET-45's
// profile endpoint.

export default function SettingsPage() {
  return (
    <>
      <PageHeader overline="Manage your account" title="Settings" />
      <main className="flex-1 pb-10" />
    </>
  );
}
