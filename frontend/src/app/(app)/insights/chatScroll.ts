// Keeping the newest turn and the composer in view after a message lands.
//
// **This scrolls the page, not a bounded message region, and that is a decision rather than a
// simplification.** The plan assumed a fixed-height scrolling list between the tab bar and the
// composer. The shell cannot give one a height without changing every screen: the root layout is
// `flex min-h-full flex-col` and `(app)/layout.tsx` is `flex flex-1 flex-col` on top of it, so
// nothing in the chain has a *definite* height - a `flex-1 min-h-0 overflow-y-auto` child of it
// resolves against its content and never overflows, so the region would simply grow and the
// `overflow` would be decoration. Changing `min-h-full` to a real height would bound the other
// three screens too, which each want to grow. So the document scrolls, which is a legitimate chat
// layout and the one this shell already supports.
//
// **It is emphatically not `scrollIntoView`.** `lib/pickerScroll.ts` records why: that method
// scrolls *every* scrollable ancestor, so it is unpredictable about what else moves. This writes
// one property on one element and can move nothing else - the same rule, applied to the document's
// own scrolling element rather than to a panel.
//
// **jsdom cannot verify the outcome**, since it runs no layout and every offset is zero, so its
// suite pins that the write happens with the computed value and the real behaviour is a browser
// check - the same split `pickerScroll.ts` and `BudgetForm`'s caret restore both live with.

/**
 * Scrolls to the bottom of the conversation.
 *
 * Called after a turn lands and after a failure, so the newest bubble and the composer are both in
 * view without the user reaching for the scrollbar. Silent when there is nothing to scroll, which
 * is the ordinary case for a short conversation rather than an exceptional one.
 *
 * @param element the document's scrolling element. Absent is tolerated so no caller has to guard,
 * and the check is **falsy rather than `=== null`**: `document.scrollingElement` is typed
 * `Element | null`, and jsdom hands back `undefined` on a document that has never been laid out -
 * which a strict null check sails straight past and every suite in this file then failed on.
 */
export function scrollToLatest(element: Element | null | undefined): void {
  if (!element) return;

  element.scrollTop = element.scrollHeight;
}
