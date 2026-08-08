import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useRef } from 'react';

import type { Palette } from '@/lib/palette';

import { AddCategoryModal } from './AddCategoryModal';

// Type-only Storybook import, for the reason `Sidebar.stories.tsx` records: importing any *value*
// from Storybook breaks the Jest story smoke test with an opaque ESM error, because
// @storybook/nextjs-vite will not load under Jest.
//
// **`parameters.nextjs.appDirectory` is load-bearing and no gate will tell you it is missing.** The
// modal calls `useRouter` for its post-save refresh, and `next/navigation` throws "invariant expected
// app router to be mounted" outside a router. Both CI gates miss it from opposite directions -
// `build-storybook` bundles stories without running one, and `screens.stories.test.tsx` renders them
// under Jest with `next/navigation` already mocked - so the story throws in the browser with a green
// suite and a green build until somebody opens it. `frontend/src/app/CLAUDE.md` records that trap.
//
// **Filed under `Screens`, not `Shell`.** `Shell/Modal` is the box itself; a frame built out of it is
// a screen, which is where `Screens/09 Add transaction` sits too.
//
// The modal takes everything as props, so these stories need no provider and no fetch: the palette is
// a literal and the action is a stub. `AddCategoryModal.test.tsx` covers the wiring for real.

const meta: Meta<typeof AddCategoryModal> = {
  title: 'Screens/19 Add category',
  component: AddCategoryModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof AddCategoryModal>;

/**
 * The palette as seeded: 16 colours and the first eight icons, in admin order.
 *
 * **The colours are the real set and the icons deliberately are not.** The colour list is what a
 * reviewer has to see whole, because the labels are the words a person picks from and the palette
 * preview artifacts sign the hues off; the icon list is 64 as of PET-65, and pasting all of them here
 * would make this file mostly fixture without showing anything the eighth entry does not. Nothing in
 * the app asserts either length - see `lib/palette.ts`.
 */
const PALETTE: Palette = {
  colors: [
    { token: 'success', label: 'Emerald' },
    { token: 'secondary', label: 'Pink' },
    { token: 'info', label: 'Sky' },
    { token: 'accent', label: 'Teal' },
    { token: 'error', label: 'Rose' },
    { token: 'primary', label: 'Indigo' },
    { token: 'primary-content', label: 'Lavender' },
    { token: 'secondary-content', label: 'Blush' },
    { token: 'accent-content', label: 'Pine' },
    { token: 'success-content', label: 'Forest' },
    { token: 'info-content', label: 'Navy' },
    { token: 'warning', label: 'Amber' },
    { token: 'warning-content', label: 'Umber' },
    { token: 'neutral', label: 'Ink' },
    { token: 'neutral-content', label: 'Silver' },
    { token: 'base-content/50', label: 'Slate' },
  ],
  icons: [
    { name: 'shopping-basket', label: 'Basket' },
    { name: 'utensils', label: 'Utensils' },
    { name: 'car', label: 'Car' },
    { name: 'zap', label: 'Bolt' },
    { name: 'heart-pulse', label: 'Heartbeat' },
    { name: 'tv', label: 'Television' },
    { name: 'graduation-cap', label: 'Graduation cap' },
    { name: 'plane', label: 'Plane' },
  ],
};

/** Accepts everything, so the happy path closes. */
const accept = async () => ({ ok: true }) as const;

/**
 * The modal as frame 19 draws it (node 102:878).
 *
 * What to diff against Figma is the structure, not the pixels: the box centred over the dimmed page,
 * four of CED-4's five fields in order, the `$` prefix and larger value on the budget field, **Color and
 * Icon sharing a row**, and the footer's secondary-then-primary pair. Its width, radius, shadow and
 * focus ring are the theme's as of PET-57.
 *
 * **Three things here have no Figma counterpart and are the ones to actually look at.** The budget
 * label carries "(optional)", because the cap really is optional and A12 makes that word the only
 * marker; focus opens on **Name** rather than on the budget field the frame rings, since that frame
 * draws every field already filled and is a mid-fill snapshot; and the tile-plus-name row under the
 * two selects is AC2's "previews on the category", which the file draws no element for.
 *
 * **A fourth departure is a subtraction: the Note field is not drawn.** The frame draws it and CED-4
 * specifies it, and it is hidden behind `SHOWS_NOTE` because a note surfaces on no screen once saved
 * (A42) - so the field waits for a category detail page to show it on. The markup and every
 * conversion behind it stay live; see the flag's own note in `AddCategoryModal.tsx`. This story is
 * where to check that its absence leaves the budget field as the only "(optional)" label and does not
 * strand the footer.
 *
 * **The frame's own two example values are unbuildable and are not reproduced.** It shows "Violet"
 * and "Repeat": there is no `violet` token, and `repeat` is a real lucide name but not one of the 64
 * this app imports. Change either select and watch the preview follow it.
 */
export const Default: Story = {
  render: () => <AddCategoryModal palette={PALETTE} create={accept} onClose={() => {}} />,
};

/**
 * Both validation messages at once, which is the artifact A29 owes a designer.
 *
 * A29 records that **no form error visual exists anywhere in the Figma file**, so the pattern -
 * daisyUI's `input-error` border plus one `text-error` line, no icon - and both strings are ours.
 * This story submits an empty form on mount with a zero budget already in place, because a genuinely
 * untouched form is wrong about its **name only**: the cap is optional, so a blank budget is valid
 * and one message is all an empty submit produces. Showing both together is what needs reviewing.
 *
 * **The budget message is the one to read carefully.** It has to state the rule and the escape at
 * once - "or leave it blank for no limit" - because the field looks required and nothing else on
 * screen says it is not. It is the only place in the UI where the optional cap is spelled out.
 *
 * The three post-network failure lines are not shown here: each replaces the others, they need a
 * round trip to provoke, and `AddCategoryModal.test.tsx` pins all three strings.
 */
export const WithMessages: Story = {
  render: () => {
    // A local component so the hook runs inside a render pass. The smoke harness calls
    // `render(args)` outside React, so a hook written directly in here would throw "invalid hook
    // call" in a suite that never opens a browser - the same constraint `Shell/Modal`'s
    // `FromTrigger` story works within.
    function Demo() {
      const host = useRef<HTMLDivElement>(null);

      useEffect(() => {
        const budget = host.current?.querySelector<HTMLInputElement>('#add-category-monthly-cap');

        if (budget !== null && budget !== undefined) {
          // Typed through the native setter and a real `input` event, so React's controlled value
          // actually updates - assigning `.value` alone is invisible to it.
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
            budget,
            '0',
          );
          budget.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // **Deferred a tick, and the first version of this story was wrong without it.** The `input`
        // event above schedules a state update; submitting in the same tick runs validation against
        // the *previous* `monthlyCap`, which is `''` - and a blank cap is valid, so the story drew
        // one message instead of two and looked like the feature only validated the name. A browser
        // check caught it; nothing else could, because the smoke suite only asserts the story does
        // not throw. `setTimeout` rather than a second effect keyed on the value, because the modal
        // owns that state and this wrapper cannot read it.
        const timer = setTimeout(() => {
          // `requestSubmit` rather than clicking, so this goes through the form's own submit path -
          // the one that runs validation - instead of simulating a pointer. The form is the modal's,
          // so it is found by tag rather than by role: a <form> only publishes the `form` role once
          // it has an accessible name.
          host.current?.querySelector('form')?.requestSubmit();
        }, 0);

        return () => clearTimeout(timer);
      }, []);

      return (
        <div ref={host}>
          <AddCategoryModal palette={PALETTE} create={accept} onClose={() => {}} />
        </div>
      );
    }

    return <Demo />;
  },
};

/**
 * The Color picker open, which **no frame draws at all** - A16 and A40 both record that Figma never
 * shows a list expanded, so every part of this panel is ours and this story is where it gets reviewed.
 *
 * What to look at: the swatch left of each name, the tick on the **right** of the chosen row, the
 * hover and the `menu-active` highlight, and that sixteen rows scroll inside `max-h-64` rather than
 * pushing the modal. The swatches are `CATEGORY_DOT`'s, so they are the same colours the cards, the
 * legend and the donut paint - a colour that looks wrong here looks wrong on the Dashboard too.
 *
 * **Worth checking in Firefox as well**, where the panel is not anchored: Firefox has no CSS anchor
 * positioning, so daisyUI's `@supports` fallback centres it over a dimmed backdrop instead. Degraded
 * rather than broken, and the same behaviour the transactions row menu already ships.
 */
export const ColourPickerOpen: Story = {
  render: () => {
    function Demo() {
      const host = useRef<HTMLDivElement>(null);

      useEffect(() => {
        // Deferred a tick for `WithMessages`' reason: the modal's own effect calls `showModal()`, and
        // opening a popover inside a dialog that is not in the top layer yet does nothing.
        const timer = setTimeout(() => {
          // Optionally called, because the story smoke suite renders this under jsdom, which
          // implements no popover at all - `jest.setup.ts` deliberately fakes none.
          host.current?.querySelector<HTMLElement>('[popover]')?.showPopover?.();
        }, 0);

        return () => clearTimeout(timer);
      }, []);

      return (
        <div ref={host}>
          <AddCategoryModal palette={PALETTE} create={accept} onClose={() => {}} />
        </div>
      );
    }

    return <Demo />;
  },
};

/**
 * The palette read having failed, which no frame draws either.
 *
 * Both selects are disabled and a `role="alert"` line says why, because a control that is inert with
 * no explanation is worse than a message. The preview tile falls back to the neutral surface rather
 * than to a colour and glyph the user did not choose, and the submit does nothing - deliberately
 * without adding "Enter a name." on top, which would blame the user for a failed network read.
 *
 * Reachable when the backend is down, or when an admin has somehow left nothing enabled. Note the
 * modal is still fully closable, which is the half worth checking here.
 */
export const PaletteUnavailable: Story = {
  render: () => <AddCategoryModal palette={null} create={accept} onClose={() => {}} />,
};
