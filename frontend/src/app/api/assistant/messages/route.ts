import { NextResponse, type NextRequest } from 'next/server';

import { sendMessage, type SendMessageBody } from '@/lib/assistant';

// One assistant turn, posted by the browser to the frontend's own origin.
//
// **The app's fourth route handler and the first the browser POSTs to.** The other three exist
// for two reasons `docs/agents/api-contract.md` used to call exhaustive - a GET navigation
// (`app/auth/verify/route.ts`) and a browser timer's poll (`app/api/insights/route.ts`,
// `app/api/categories/route.ts`) - so **a cancellable long write is a third reason**, and that
// file says so now rather than leaving the next reader a two-item list that no longer covers the
// set.
//
// **Cancellation is the whole reason this is not a Server Action.** A client component calling
// one has no `AbortController` to reach: the RPC is opaque, there is no `signal` parameter, and
// `AddTransactionModal` settled for a generation-counter trick precisely because the platform
// offers nothing better - the request runs to completion server-side and only its *result* is
// discarded. Given that a turn costs roughly 40k input tokens and runs for tens of seconds on a
// free tier, being able to actually stop one is worth a file. A route handler makes the send an
// ordinary `fetch`, and an ordinary `fetch` takes a `signal`.
//
// **This is hop 2 of three, and hop 2 is what makes hop 1 more than cosmetic.** The composer owns
// the controller and aborts its own `fetch`; without passing `request.signal` through here, this
// handler would keep waiting on a backend nobody is listening to, and the backend would keep
// spending quota. Hop 3 is `abortOnClientDisconnect` in the backend, combining that dropped
// connection with the model call's own timeout. `docs/explainers/cancelling-an-ai-request.md` is
// the plain-language account of all three.
//
// It publishes no capability the page above it does not: a POST sending the caller's own message
// to the caller's own account, authorised by the caller's own httpOnly cookie, which the browser
// attaches to a same-origin request without any script touching it. `BACKEND_URL` and the bearer
// token both stay server-side.
//
// **Deliberately not declared in `lib/routes.ts`**, exactly as the other two data handlers are
// not: `ACCESS_ROUTES` holds the access screens' paths, and an internal endpoint no screen
// navigates to would need a fourth category in a suite whose whole point is that every key is
// classified. The one string that must not drift is the path in `lib/sendAssistantMessage.ts`,
// and that module's suite asserts it exactly.

/** A write must never be reused, at either hop. */
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(request: NextRequest) {
  let body: SendMessageBody;

  try {
    body = (await request.json()) as SendMessageBody;
  } catch {
    // Nothing the browser sent could be parsed. The backend's own 400 is what the composer's
    // copy is written against, so answering the same status keeps one taxonomy rather than two.
    return new NextResponse(null, { status: 400, headers: NO_STORE });
  }

  // **`request.signal` passed through, and that is the entire point of this file.** It aborts
  // when the client disconnects, which is what the composer's "Stop" causes.
  const result = await sendMessage(body, request.signal);

  if (result.ok) {
    return NextResponse.json(result.data, { status: 201, headers: NO_STORE });
  }

  // **No body on any failure, and the status is the backend's own.** `lib/sendAssistantMessage.ts`
  // owns the eight outcomes and every string the user reads; this hop's whole job is moving the
  // status, which is what keeps the copy in one place.
  //
  // An absent status means the request never completed - the convention `lib/backend.ts` sets -
  // and **502 is the honest answer to that from here, deliberately not 503.** This shipped as 503
  // and a review caught it: `lib/sendAssistantMessage.ts` reads a 503 as `unavailable`, whose copy
  // says the assistant is switched off on this deployment, so a dropped connection or an
  // unreachable backend told the user something definite about configuration. That file's own
  // taxonomy assigns "a request that never completed" to `failed` ("Try again in a moment"), which
  // is what any status outside its switch produces. Note a **401 travels through unchanged rather
  // than becoming a redirect**, for the reason `app/api/insights/route.ts` records: a redirect
  // answers the browser's `fetch` with an HTML login page carrying a 200, which the composer would
  // render as a reply.
  return new NextResponse(null, {
    status: result.status ?? 502,
    headers: NO_STORE,
  });
}
