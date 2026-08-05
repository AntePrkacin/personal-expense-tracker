import { redirect } from 'next/navigation';

import { hasSession } from '@/lib/session';

import { LoginScreen } from './LoginScreen';

// 23 Log in. The screen is its own module so Storybook can render it and this file
// only answers the route, which is the shape all four other access routes take.
//
// **Gated on a session as of PET-52**, which is what the previous version of this
// comment said was PET-52's to decide. It was ungated only because `lib/session.ts` held
// two stubs that answered optimistically, so a third call into them would have been a
// claim nothing could test; that reason is gone now the stubs are real. A signed-in
// visitor here would otherwise request a link they do not need - the backend would send
// it, and it would work, which is right rather than broken, just pointless.
//
// `docs/TODO.md` asked for this and `/setup` to be answered "in the same breath", and
// they are: the same `hasSession()` branch `app/page.tsx` uses, sending both to the
// Dashboard. `/check-email` deliberately keeps none, because its whole premise is that
// no session exists yet.
//
// **This route stops prerendering static, and that is the change rather than a
// regression.** The `cookies()` read behind `hasSession()` opts it out on its own, which
// is exactly what `lib/session.ts` predicted for `/` - so there is still no
// `export const dynamic` here, and adding one would be a claim about nothing.

export default async function Login() {
  if (await hasSession()) {
    // Hard-coded rather than read from SIDEBAR_HREFS, the same call `app/page.tsx`
    // makes: this string and the sidebar's own /dashboard href are two independent
    // halves of one contract, and sharing a constant would let them move together and
    // stay wrong.
    redirect('/dashboard');
  }

  return <LoginScreen />;
}
