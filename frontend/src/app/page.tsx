import { redirect } from 'next/navigation';

// `/` is not a screen. The design has no frame for it: a signed-in visitor
// belongs on the Dashboard - VER-4 lands both a new and a returning account
// there - and a signed-out one belongs in the access flow, which the (app)
// shell's own session check sends them to once PET-52 builds it.
//
// So this redirects and the shell decides the rest. Doing it here rather than in
// a middleware matcher keeps the one rule in one place.
//
// This replaced the scaffold greeting page that fetched GET /api/hello. That was
// the proof the two apps could talk to each other, and it was worth keeping only
// until there was a real screen to put in its place. Nothing in the frontend
// calls the backend now, which is a real gap: the verify page (PET-52) and the
// profile read (PET-45) are what make it true again.

export default function Home() {
  redirect('/dashboard');
}
