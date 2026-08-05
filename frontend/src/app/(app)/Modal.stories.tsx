import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

import { Modal } from './Modal';

// Type-only Storybook import, for the reason Sidebar.stories.tsx records: importing any
// *value* from Storybook breaks the Jest story smoke test with an opaque ESM error, because
// @storybook/nextjs-vite will not load under Jest.
//
// Filed under "Shell" rather than "Components", the same call PageHeader makes: this is not
// one of the nine tiles on the Figma Components page, it is the app shell's own box.
//
// **These two stories are the only review available for three of this component's
// behaviours.** jsdom implements no part of the top layer, so Escape, the focus trap and
// focus returning to the trigger cannot be asserted in Jest and are deliberately not faked
// (see jest.setup.ts). Open `From trigger` and check them by hand - that is what the plan's
// verification step means, and there is no CI gate behind it.

const meta: Meta<typeof Modal> = {
  title: 'Shell/Modal',
  component: Modal,
  tags: ['autodocs'],
  parameters: {
    // The box centres itself over the whole viewport through the UA's dialog margin, so
    // Storybook's padding would only fight it.
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof Modal>;

/**
 * The box as frame 09 draws it (node 28:384), mounted open for the pixel diff.
 *
 * Rendered rather than given `args`, because the fields below are the caller's content and
 * this is the arrangement to compare against Figma: a full-width row, a two-up row, and a
 * footer of secondary plus primary.
 */
export const Open: Story = {
  render: () => (
    <Modal
      title="Add transaction"
      onClose={() => {}}
      initialFocusId="story-amount"
      footer={
        <>
          <Button label="Cancel" variant="secondary" />
          <Button label="Add transaction" />
        </>
      }
    >
      <Input id="story-amount" label="Amount" variant="currency" defaultValue="24.00" />
      <div className="flex w-full gap-3">
        <Input id="story-date" label="Date" defaultValue="Oct 8, 2025" />
        <Input id="story-merchant" label="Merchant" defaultValue="Whole Foods" />
      </div>
      <Input id="story-note" label="Note (optional)" defaultValue="Weekly groceries" />
    </Modal>
  ),
};

/**
 * The same box behind a real trigger, which is the story to open when checking the
 * behaviours Jest cannot see: Escape, Tab and Shift+Tab staying inside the dialog, and focus
 * returning to "Add transaction" after it closes.
 *
 * **The hooks live in an inner component, not in `render` itself.** The Jest story smoke
 * harness calls `render(args)` outside React, so a `useState` written directly in here would
 * throw "invalid hook call" in a suite that never opens a browser. Returning an element whose
 * *type* is a component keeps the hook inside a render pass. The same harness also never
 * applies `decorators`, which is why nothing this story needs lives in one.
 */
export const FromTrigger: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);

      return (
        <div className="bg-surface-canvas flex min-h-screen items-start p-10">
          <Button label="Add transaction" onClick={() => setOpen(true)} />

          {open ? (
            <Modal
              title="Add transaction"
              onClose={() => setOpen(false)}
              initialFocusId="demo-amount"
              onSubmit={(event) => {
                event.preventDefault();
                setOpen(false);
              }}
              footer={
                <>
                  <Button label="Cancel" variant="secondary" onClick={() => setOpen(false)} />
                  <Button type="submit" label="Add transaction" />
                </>
              }
            >
              <Input id="demo-amount" label="Amount" variant="currency" defaultValue="24.00" />
              <Input id="demo-merchant" label="Merchant" placeholder="Where you spent it" />
            </Modal>
          ) : null}
        </div>
      );
    }

    return <Demo />;
  },
};
