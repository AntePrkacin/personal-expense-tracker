// Test queries for the toast region, for the suites that assert a write reported itself.
//
// **They are attribute queries rather than role queries, and that is the region's design showing
// through.** `ToastRegion.tsx` publishes `aria-live` and no role, precisely so an always-mounted
// announcer does not make `getByRole('alert')` ambiguous on every screen in the app. The cost is
// that Testing Library has no built-in query for it, which is what this file is.
//
// **Prefer `toastMessages()` for "did this post".** The announcer holds the same sentence for
// `ANNOUNCEMENT_CLEAR_MS`, so a bare `getByText` is ambiguous while it is up and answers about the
// announcement when it meant to ask about the stack. The dismiss control exists only in the visible
// stack, which is what makes it the honest handle.

/**
 * What the polite region is currently announcing. Empty string when it is at rest.
 *
 * **Queried by `data-toast-announcer`, not by `[aria-live]`**, and a review found why: publishing
 * no role leaves the attribute as the only other handle, and two shipped components render an
 * `aria-live="polite"` of their own - `DateField`'s month label while its calendar is open, and
 * `AssistantMessageList`'s `role="log"` whenever the chat holds messages. `ToastProvider` renders
 * `{children}` before the region, so both come first in DOM order and a bare selector returns
 * "October 2025" or a conversation transcript. `AddTransactionModal.test.tsx` already calls this on
 * a screen holding a `DateField` and passes only because those cases leave the picker closed - so a
 * suite that opened it would report a toast as announced that was never announced.
 */
export function politeAnnouncement(): string {
  return document.querySelector('[data-toast-announcer="polite"]')?.textContent ?? '';
}

/** What the assertive region is currently announcing. Empty string when it is at rest. */
export function assertiveAnnouncement(): string {
  return document.querySelector('[data-toast-announcer="assertive"]')?.textContent ?? '';
}

/**
 * Every message currently on the visible stack, oldest first.
 *
 * Read off each toast's dismiss control, whose accessible name is `Dismiss: {message}` - so this
 * sees the stack and never the announcers, and a suite asserting `['Transaction added.']` is
 * asserting that one toast is up rather than that a string exists somewhere in the DOM.
 */
export function toastMessages(): string[] {
  const region = document.querySelector('[popover].toast');

  if (region === null) return [];

  return [...region.querySelectorAll('button')]
    .map((button) => button.textContent ?? '')
    .filter((text) => text.startsWith(DISMISS_PREFIX))
    .map((text) => text.slice(DISMISS_PREFIX.length));
}

/**
 * The dismiss control's name prefix, and both narrowings above are load-bearing.
 *
 * **`[popover].toast` rather than `[popover]`**, because this app has five other popovers - two
 * kebab menus, the colour picker, the icon picker and the date field - and three of them hold a
 * grid of buttons. A bare attribute selector read the colour palette back as a list of toasts,
 * which is a query that answers confidently and wrongly. **The prefix filter** is the second half:
 * it keeps a future control inside the region from being counted as a message.
 */
const DISMISS_PREFIX = 'Dismiss: ';
