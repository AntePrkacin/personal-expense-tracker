import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from '@/components/ui/Button';

import { Modal } from './Modal';
import { ToastProvider, useToast } from './ToastProvider';
import { ToastRegion, type Toast } from './ToastRegion';

// Type-only Storybook import, for the reason `Sidebar.stories.tsx` records: importing any *value*
// from Storybook breaks the Jest story smoke test with an opaque ESM error.
//
// Filed under "Shell" rather than "Components", the call `Modal` and `PageHeader` both make: this is
// not one of the tiles on the Figma Components page, it is the shell's own region.
//
// **These stories are the only review this component gets, and that is not a figure of speech.**
// A29 designs no toast at all - no frame, no tone, no duration, no copy - so every string, the
// corner, the two colours and both timers are ours and owe a designer. `docs/TODO.md` carries them
// alongside the rest of A29's list.
//
// **`OverAModal` is the one to open first**, because it is the only place the popover's whole reason
// for existing is visible: the stack has to paint *above* a dialog that is in the top layer, which
// no Jest suite can see. Its companion fact is that the dismiss button is inert while that dialog is
// open - measured in Chrome, recorded in `ToastRegion.tsx` - so in that story the toast is cleared
// by its timer rather than by the control, and that is the designed behaviour rather than a bug in
// the story.
//
// The stories that take a static list render `ToastRegion` directly, with no provider and no timers
// running, which is what the two-file split buys: a stack of three that stays put long enough to be
// looked at.

const meta: Meta<typeof ToastRegion> = {
  title: 'Shell/Toast',
  component: ToastRegion,
  tags: ['autodocs'],
  parameters: {
    // The region is `position: fixed` in the viewport's bottom-right corner, so Storybook's
    // centred padding would only fight it - the same call `Modal.stories.tsx` makes.
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof ToastRegion>;

const SUCCESS: Toast = { id: 1, kind: 'success', message: 'Transaction added.' };
const FAILURE: Toast = {
  id: 2,
  kind: 'failure',
  message: 'Something went wrong. Please try again.',
};

/** One success, which is what eleven of the twelve call sites post on their happy path. */
export const Success: Story = {
  render: () => (
    <ToastRegion
      toasts={[SUCCESS]}
      politeAnnouncement={SUCCESS.message}
      assertiveAnnouncement=""
      onDismiss={() => {}}
    />
  ),
};

/** One failure. The tone and the longer timer are the only things separating it from the above. */
export const Failure: Story = {
  render: () => (
    <ToastRegion
      toasts={[FAILURE]}
      politeAnnouncement=""
      assertiveAnnouncement={FAILURE.message}
      onDismiss={() => {}}
    />
  ),
};

/**
 * The cap: three at once, oldest at the top.
 *
 * Reachable rather than hypothetical - deleting three categories in a row is three posts - and it
 * is the state that says whether the corner can carry a column at all.
 */
export const Stacked: Story = {
  render: () => (
    <ToastRegion
      toasts={[
        { id: 1, kind: 'success', message: 'Transaction added.' },
        { id: 2, kind: 'success', message: 'Category limits saved.' },
        { id: 3, kind: 'failure', message: 'Your session has ended. Please log in again.' },
      ]}
      politeAnnouncement=""
      assertiveAnnouncement=""
      onDismiss={() => {}}
    />
  ),
};

/**
 * The longest string any call site posts, against the region's `max-w`.
 *
 * daisyUI's `.toast` is `width: max-content` capped at `calc(100vw - 2rem)`, so this is what says
 * whether a sentence wraps inside the alert or pushes the corner off a narrow viewport.
 */
export const LongMessage: Story = {
  render: () => (
    <ToastRegion
      toasts={[
        {
          id: 1,
          kind: 'failure',
          message: 'Your pay schedule was saved, but your profile changes were not.',
        },
      ]}
      politeAnnouncement=""
      assertiveAnnouncement=""
      onDismiss={() => {}}
    />
  ),
};

/**
 * The one that matters: a real post, from inside an open `Modal`.
 *
 * Everything here is live - the provider, the timers, the popover - so this is where to check that
 * the toast paints over the dialog, that it clears itself, and that a second press stacks rather
 * than replaces. Expect the dismiss control not to respond while the dialog is open; close the
 * dialog and it does.
 */
export const OverAModal: Story = {
  render: () => (
    <ToastProvider>
      <ModalWithPost />
    </ToastProvider>
  ),
};

function ModalWithPost() {
  const { post } = useToast();

  return (
    <Modal
      title="Add transaction"
      onClose={() => {}}
      footer={
        <>
          <Button
            label="Post a failure"
            variant="secondary"
            onClick={() =>
              post({ kind: 'failure', message: 'Something went wrong. Please try again.' })
            }
          />
          <Button
            label="Post a success"
            onClick={() => post({ kind: 'success', message: 'Transaction added.' })}
          />
        </>
      }
    >
      <p className="text-sm">
        The dialog is in the top layer. Press either control and the toast has to paint over it.
      </p>
    </Modal>
  );
}
