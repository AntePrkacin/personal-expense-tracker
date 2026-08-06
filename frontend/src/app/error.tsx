'use client';

import { ErrorScreen } from './ErrorScreen';

// The app's error boundary, and the file four `lib/` modules already assumed existed.
// `ErrorScreen.tsx` beside it carries the whole account of why it is here, why there is one
// of them rather than one per segment, and where its copy comes from.
//
// **`'use client'` is required by Next rather than by anything in here**: an error boundary
// is a client component whatever it renders, because it is what React unwinds a failed render
// into. The screen it renders needs the directive on its own account too, for `reset`.
//
// The `error` prop is deliberately not displayed. In production a Server Component's message
// is redacted to a generic string before it crosses the wire, so rendering it would print
// "An error occurred in the Server Components render" at a user; the `digest` beside it is the
// half that means anything, and that is what goes on screen.

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen digest={error.digest} reset={reset} />;
}
