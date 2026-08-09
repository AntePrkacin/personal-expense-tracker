import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { Palette } from '@/lib/palette';

import { EditCategoryModal } from './EditCategoryModal';
import { category } from './categoryFixture';

// Type-only Storybook import, for the reason `Sidebar.stories.tsx` records: importing any *value*
// from Storybook breaks the Jest story smoke test with an opaque ESM error, because
// @storybook/nextjs-vite will not load under Jest.
//
// **`parameters.nextjs.appDirectory` is load-bearing and no gate will tell you it is missing.** The
// modal calls `useRouter` for its post-save refresh, and `next/navigation` throws "invariant expected
// app router to be mounted" outside a router. Both CI gates miss it from opposite directions -
// `build-storybook` bundles stories without running one, and `screens.stories.test.tsx` renders them
// under Jest with `next/navigation` already mocked - so the story throws in the browser with a green
// suite and a green build until somebody opens it.
//
// **Filed under `Screens`, not `Shell`**, beside `Screens/19 Add category`, whose stories these are
// deliberately a short set against: the two modals share their fields, so the pickers, the messages
// and the empty palette are all reviewed there. What is worth opening here is what is **only** true
// of an edit - the prefill, the third footer control, and the uncapped row that has no cap to show.
//
// The modal takes everything as props, so these stories need no provider and no fetch: the palette is
// a literal and both callbacks are stubs. `EditCategoryModal.test.tsx` covers the wiring for real.

const meta: Meta<typeof EditCategoryModal> = {
  title: 'Screens/21 Edit category',
  component: EditCategoryModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof EditCategoryModal>;

/**
 * The palette as seeded, trimmed to the same shape `Screens/19 Add category` uses.
 *
 * Sixteen colours because a reviewer has to see every hue, and a dozen icons rather than that
 * story's thirty: the grid's scrolling and its search are reviewed there, and what this file needs
 * is only that the stored mark comes back ticked.
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
    { name: 'tv', label: 'Television' },
    { name: 'plane', label: 'Plane' },
    { name: 'gift', label: 'Gift' },
    { name: 'house', label: 'House' },
    { name: 'wifi', label: 'Wi-Fi' },
    { name: 'music', label: 'Music note' },
    { name: 'credit-card', label: 'Credit card' },
    { name: 'camera', label: 'Camera' },
  ],
};

/** Frame 21's own category: "Subscriptions", $250.00, with the note the frame draws and this does not. */
const SUBSCRIPTIONS = category({
  id: '0198c2a1-0000-7000-8000-0000000000b7',
  name: 'Subscriptions',
  monthlyCap: 250,
  color: 'primary',
  icon: 'tv',
  note: 'Streaming, apps & memberships',
});

/** Accepts everything, so the happy path closes. */
const accept = async () => ({ ok: true }) as const;

/**
 * The modal as frame 21 draws it (node 116:1040), prefilled with the frame's own category.
 *
 * What to diff against Figma is the structure, not the pixels: the box centred over the dimmed page,
 * the title "Edit category", the fields in CED-4's order, the `$` prefix and larger value on the
 * budget, **Color and Icon sharing a row**, and a footer whose left holds a red trash-and-label
 * "Delete category" opposite Cancel and "Save changes". Its width, radius, shadow and focus ring are
 * the theme's as of PET-57.
 *
 * **Three departures from the frame, and all three are recorded on the ticket.** The Note field is
 * not drawn, behind the same `SHOWS_NOTE` flag frame 19's modal uses, because a note surfaces on no
 * screen once saved (A42) - its value is prefilled into state regardless, so saving never clears a
 * note the user cannot see. The budget label carries "(optional)", because the cap really is
 * optional and A12 makes that word the only marker of a required field. And focus opens on **Name**
 * rather than on the budget field the frame rings, since that frame draws every field already filled
 * and is a mid-fill snapshot rather than an on-open state.
 *
 * **The frame's two example values are unbuildable and are not reproduced**, exactly as in frame 19:
 * there is no `violet` token, and `repeat` is a real lucide name but not one of the 64 this app
 * imports. Indigo and Television stand in. Open either picker and the stored one is the ticked row.
 */
export const Default: Story = {
  render: () => (
    <EditCategoryModal
      category={SUBSCRIPTIONS}
      palette={PALETTE}
      update={accept}
      onDelete={() => {}}
      onClose={() => {}}
    />
  ),
};

/**
 * The same modal opened from a card's "Set limit" banner, which is this ticket's second entry point.
 *
 * Two things differ from `Default` and both are worth looking at. The budget field opens **focused**,
 * because the banner it came from reads "No limit set for this category" and that is not an
 * unspecific invitation the way the kebab's "Edit" is. And the field opens **blank** rather than at
 * zero, because an uncapped category has no cap - which is also the state a user returns it to by
 * clearing the field, since a blank budget saves as `null`.
 *
 * The preview row is the other thing to check here: an uncapped category is an ordinary category in
 * every other respect, so its tile and name read exactly as the capped one's do.
 */
export const SettingALimit: Story = {
  render: () => (
    <EditCategoryModal
      category={category({
        id: '0198c2a1-0000-7000-8000-0000000000a2',
        name: 'Subscriptions',
        color: 'primary',
        icon: 'tv',
        monthlyCap: null,
        percentUsed: null,
        remaining: null,
        over: null,
        status: 'uncapped',
        spent: 148,
        transactionCount: 6,
      })}
      palette={PALETTE}
      update={accept}
      onDelete={() => {}}
      onClose={() => {}}
      focus="monthlyCap"
    />
  ),
};

/**
 * The palette read having failed, which is where this modal diverges from frame 19's in substance.
 *
 * There a failed palette blocks the whole form, because a create has no colour until the read lands.
 * Here it blocks two fields: the colour and the icon are prefilled from the stored row, so the name
 * and the budget stay perfectly saveable and **"Save changes" really saves**. The line says which
 * two fields are affected rather than implying the modal is broken, which is the fifth message this
 * feature owes A29 a sign-off on.
 *
 * What to check: both pickers disabled, the preview still painting the stored mark rather than
 * falling back to nothing, and a name edit going through. The empty-palette variant reads almost the
 * same and means something different; `Screens/19 Add category` puts the two side by side.
 */
export const PaletteUnavailable: Story = {
  render: () => (
    <EditCategoryModal
      category={SUBSCRIPTIONS}
      palette={null}
      update={accept}
      onDelete={() => {}}
      onClose={() => {}}
    />
  ),
};
