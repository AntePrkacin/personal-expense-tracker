import { redirect } from 'next/navigation';

import { hasSession } from '@/lib/session';

import { WelcomeScreen } from './WelcomeScreen';

// `/` is the app's front door, and the one decision it makes is which door.
//
// A signed-out visitor belongs on 01 Welcome, which is what this renders. A
// signed-in one belongs on the Dashboard - VER-4 lands both a new and a returning
// account there - so they never see the pitch again. Both branches are legitimate
// destinations, which is why this asks `hasSession()` for a fact rather than
// calling `requireSession()` and being redirected at.
//
// The rule lives here rather than in a middleware matcher so it has one home.
//
// **Until PET-52, `hasSession()` always answers false**, so every visitor lands on
// Welcome and `/dashboard` is reached by typed URL. That is the same deferral the
// (app) shell already carries - its own gate lets everyone through - and filling
// both in is a change to lib/session.ts alone.
//
// Two things not to add here. There is no `export const dynamic`: nothing in this
// path reads a request today, so `/` prerenders the signed-out branch, which is
// correct, and PET-52's `cookies()` read opts the route out on its own. And the
// screen stays a separate component rather than being inlined, because this
// function is async and Storybook cannot render an async Server Component that
// awaits a session.

export default async function Home() {
  if (await hasSession()) {
    // Hard-coded rather than read from SIDEBAR_HREFS: this string and the sidebar's
    // own /dashboard href are two independent halves of the same contract, and a
    // shared constant would let them move together and stay wrong.
    redirect('/dashboard');
  }

  return <WelcomeScreen />;
}
