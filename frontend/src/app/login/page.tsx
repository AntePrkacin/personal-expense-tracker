import { LoginScreen } from './LoginScreen';

// 23 Log in. The screen is its own module so Storybook can render it and this file
// only answers the route, which is the shape all four other access routes take.
//
// **No session gate**, for the reason `/setup` has none: `lib/session.ts` holds two
// stubs that answer optimistically, and a third call into them would be a claim
// nothing can test. `/` already redirects a signed-in visitor to the Dashboard, and
// LOG-5 makes Welcome's "I already have an account" the only designed entry here.
// Whether this route stays reachable with a live session is PET-52's.
//
// And no `export const dynamic`: nothing in this path reads a request, so it
// prerenders static, correctly. That is the opposite of `(app)/layout.tsx`, whose
// `force-dynamic` is load-bearing - do not copy it here by reflex.

export default function Login() {
  return <LoginScreen />;
}
