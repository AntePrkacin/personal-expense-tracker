import { requireProfile } from '@/lib/profile';

import { SettingsScreen } from './SettingsScreen';

// 17 Settings (Figma node 40:630).
//
// **The fourth and last `<main>` to be filled**, as of PET-46, so no routed view in this shell
// renders an empty one any more.
//
// It reads through `requireProfile()`, which is the same call `(app)/layout.tsx` makes for the
// sidebar footer - deliberately, rather than threading the layout's copy down. A layout cannot pass
// props to the page it wraps in the App Router, and the alternatives are a context (a provider on
// all four routes to serve one screen) or a second read. The second read is the smaller of the two,
// and it is what makes the form's own diff baseline the *current* profile after a
// `router.refresh()` rather than whatever the shell happened to hold. `docs/TODO.md` records the
// cost.
//
// Its failure policy comes with the helper and is not restated here: a 401 redirects to Log in, and
// an unreachable backend throws to `app/error.tsx` rather than bouncing - the distinction that
// closed the `/dashboard` to `/login` loop.
//
// PET-46 ships the Profile card and the page-level "Save changes". The Preferences card and the
// Categories summary are PET-47's, and they drop into the same `<form>` in `SettingsForm`.

export default async function SettingsPage() {
  const profile = await requireProfile();

  return <SettingsScreen profile={profile} />;
}
