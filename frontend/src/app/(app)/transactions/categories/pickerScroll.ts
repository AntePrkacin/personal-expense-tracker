// Putting a picker's chosen row in the middle of its own scroll box when the panel opens.
//
// Shared by `ColourSelect` and `IconSelect` rather than copied into both, which is the exception
// `(app)/useCategoryOptions.ts` already argues for: the rule of three is about markup wrappers, and a
// second hand-maintained copy of a geometric calculation is how one of them quietly stops matching.
// Two consumers, one formula.

/**
 * Scrolls `container` so that the row marked `aria-current` sits vertically centred in it.
 *
 * **Not `scrollIntoView({ block: 'center' })`, and the difference is what else moves.** That method
 * scrolls *every* scrollable ancestor of the element, and a picker panel is a DOM descendant of
 * daisyUI's `modal-box`, which is itself `overflow-y: auto` - so centring a cell would also jog the
 * modal sitting behind the popover, which reads as the page lurching for no reason. This writes one
 * property on one element and can move nothing else.
 *
 * **`[aria-current]` is the selector, so the accessibility attribute doubles as the hook.** Both
 * pickers already mark their chosen row with it for a screen reader's sake; reusing it here means
 * there is no second source of truth about which row is chosen, and a row that lost the attribute
 * would fail an assertion rather than silently stop being centred.
 *
 * Silent about both nothing-to-do cases, which are ordinary rather than exceptional: a container that
 * has not mounted yet, and a picker with no chosen row (the palette having failed to load, where the
 * control is disabled and cannot be opened anyway).
 *
 * **jsdom cannot verify the outcome**, since it runs no layout and every rect is zero - so the suite
 * pins the arithmetic against stubbed geometry and the real behaviour is a browser check.
 */
export function centreChosenRow(container: HTMLElement | null): void {
  if (container === null) return;

  const chosen = container.querySelector<HTMLElement>('[aria-current]');
  if (chosen === null) return;

  const containerBox = container.getBoundingClientRect();
  const chosenBox = chosen.getBoundingClientRect();

  // The row's offset from the top of the visible box, less half the leftover space, which is what
  // puts its middle on the container's middle. `+=` rather than `=` because the container may already
  // be scrolled, and both rects are viewport-relative.
  container.scrollTop +=
    chosenBox.top - containerBox.top - (containerBox.height - chosenBox.height) / 2;
}
