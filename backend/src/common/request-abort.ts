import type { Request, Response } from 'express';

/**
 * A signal that fires when the client goes away, and **not** when the response
 * completes normally.
 *
 * This is the third hop of the abort chain: the composer owns an
 * `AbortController` and passes its signal to `fetch`, the Next route handler
 * passes `request.signal` through to the backend, and this is what turns a
 * dropped backend connection into an abort the Gemini call can actually see.
 * Without it the first two hops are cosmetic - the backend keeps running a turn
 * nobody is listening to, which is the entire reason the send stopped being a
 * Server Action. `docs/explainers/cancelling-an-ai-request.md` is the
 * plain-language account.
 *
 * **The `writableEnded` guard is the whole of the difficulty.** The platform
 * adapter is Express, where `close` fires on a normally completed response as
 * well as on a dropped connection, so an unguarded listener aborts its own
 * successful reply - a failure that is indistinguishable from a flaky model call
 * in a log and looks perfectly correct in the diff. That is why it is verified in
 * a browser rather than only in a unit test: let a turn complete normally and
 * confirm the reply still arrives.
 *
 * **The `response` is the only thing to watch, and the `request` is a trap.** The
 * first version of this file short-circuited on `request.destroyed`, reasoning
 * that a caller already gone was free to detect. It is not a test of that at all:
 * `body-parser` reads a JSON body to completion before the handler runs, and a
 * fully-consumed request stream **is** destroyed - so that check was true on every
 * POST, and every turn aborted itself in about 25ms with `AbortError: This
 * operation was aborted` and a 500. Every unit test passed, because the specs
 * drive `complete()` with a hand-made signal and never build one from a real
 * request; a browser walk found it on the first send. Do not reintroduce a
 * request-side check: the socket closing is what `close` on the response already
 * reports.
 *
 * Nothing detaches the listener, and nothing needs to: it is attached to the
 * per-request `res`, which is collected with the request.
 *
 * @param _request kept in the signature because "which request" is the question a
 * caller is answering, and because the wrong version of this took it seriously.
 */
export function abortOnClientDisconnect(
  _request: Request,
  response: Response,
): AbortSignal {
  const controller = new AbortController();

  response.on('close', () => {
    if (!response.writableEnded) {
      controller.abort();
    }
  });

  return controller.signal;
}
