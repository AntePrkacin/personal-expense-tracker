import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useRef } from 'react';

import type { Profile } from '@/lib/profile';
import type { UpdateProfileResult } from '@/lib/updateProfile';

import { SettingsScreen } from './SettingsScreen';

// The import above is type-only on purpose. Importing any *value* from Storybook breaks the story
// smoke tests with an opaque ESM error, because @storybook/nextjs-vite will not load under Jest and
// only the erased type import keeps this module loadable there. Same note as the other screen
// stories.
//
// **The screen takes its whole state as props**, which is the payoff of `page.tsx` owning the read:
// this module imports nothing server-only, so there is no `next/headers` in the browser bundle and
// no request scope to fake.
//
// **`save` is stubbed in every story, and that is a requirement rather than tidiness.** Storybook's
// Vite build has no notion of `'use server'`, so it bundles `lib/updateProfile.ts` as an ordinary
// module - a press with the real default would reach `cookies()` from `next/headers` in the
// browser. `CategoriesScreen.stories.tsx` defaults all three of its actions in a shared frame for
// the same reason; here there is one, so each story passes it.
//
// **`nextjs: { appDirectory: true }` is mandatory, and no gate will tell you.** `SettingsForm`
// calls `useRouter()` for its post-save refresh, and `next/navigation` throws `invariant expected
// app router to be mounted` outside a router - but `build-storybook` bundles stories without running
// them and `screens.stories.test.tsx` renders this module with `next/navigation` already mocked, so
// both gates stay green and only opening the story finds it.
//
// **The sidebar is deliberately absent.** These stories are the content column, so diff them
// against node `40:676` (frame 17's right-hand column) rather than against the whole 1440px frame.
//
// **Only the Profile card is here.** The Preferences card and the Categories summary the frame
// draws below it are PET-47's, so a diff against the frame is expected to stop after the first card
// and the Save row.

/** Frame 17's own values, so `Default` is a literal diff target. */
const PROFILE: Profile = {
  firstName: 'Marko',
  lastName: 'Kovač',
  email: 'marko@email.com',
  currency: 'USD',
  monthlyBudget: 2000,
  monthStartDay: 1,
};

const accept = async (): Promise<UpdateProfileResult> => ({ ok: true });

const meta: Meta<typeof SettingsScreen> = {
  title: 'Screens/17 Settings',
  component: SettingsScreen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
  args: { profile: PROFILE, save: accept },
};

export default meta;
type Story = StoryObj<typeof SettingsScreen>;

/** The frame as drawn: the Profile card prefilled, initials "MK", and the page's single Save. */
export const Default: Story = {};

/**
 * A stored last name of nothing, which is the state `initials` and `shortName` both degrade for.
 *
 * Worth a story because the avatar is the one place on this card where a missing field is
 * *visible* rather than merely blank: the circle shows one letter, and the sidebar footer beside it
 * drops the trailing initial entirely. Reachable through the API, which validates the name as
 * non-empty only when the field is sent.
 */
export const SingleName: Story = {
  args: { profile: { ...PROFILE, firstName: 'Marko', lastName: '' } },
};

/** A long hyphenated name and a long address, against the two-column row and the `max-w-205` ceiling. */
export const LongValues: Story = {
  args: {
    profile: {
      ...PROFILE,
      firstName: 'Marija-Magdalena',
      lastName: 'Kovačević-Horvat',
      email: 'marija.magdalena.kovacevic@example-company-mail.com',
    },
  },
};

/**
 * All three inline messages at once, which is the artifact A29 owes a sign-off on.
 *
 * An untouched form cannot show them, so the story empties the three fields and submits. It is
 * built with `AddCategoryModal.stories.tsx`'s technique, and both halves of that are load-bearing:
 * the values go in through the native setter plus a real `input` event, because assigning `.value`
 * alone is invisible to React's controlled input; and the submit is **deferred a tick**, because
 * those events schedule state updates and submitting in the same tick validates the previous state.
 */
export const WithMessages: Story = {
  render: (args) => {
    // A local component so the hooks run inside a render pass. The smoke harness calls
    // `render(args)` outside React, so hooks written directly in here would throw "invalid hook
    // call" in a suite that never opens a browser.
    function Demo() {
      const host = useRef<HTMLDivElement>(null);

      useEffect(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

        for (const id of ['settings-first-name', 'settings-last-name', 'settings-email']) {
          const field = host.current?.querySelector<HTMLInputElement>(`#${id}`);
          if (field) {
            setter?.call(field, '');
            field.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }

        // `requestSubmit` rather than clicking, so this goes through the form's own submit path -
        // the one that runs validation - instead of simulating a pointer. Found by tag rather than
        // by role: a <form> only publishes the `form` role once it has an accessible name.
        const timer = setTimeout(() => {
          host.current?.querySelector('form')?.requestSubmit();
        }, 0);

        return () => clearTimeout(timer);
      }, []);

      return (
        <div ref={host}>
          <SettingsScreen {...args} />
        </div>
      );
    }

    return <Demo />;
  },
};

/**
 * The 409, which is the one failure line a real user reaches.
 *
 * `updateCategory`'s and `deleteCategory`'s own 409s sit behind controls that are not drawn; this
 * one is the ordinary case of two accounts wanting one address, so its copy names the cause and is
 * worth putting in front of a designer on its own.
 */
export const EmailTaken: Story = {
  args: { save: async (): Promise<UpdateProfileResult> => ({ ok: false, reason: 'taken' }) },
  render: (args) => {
    function Demo() {
      const host = useRef<HTMLDivElement>(null);

      useEffect(() => {
        const email = host.current?.querySelector<HTMLInputElement>('#settings-email');

        if (email) {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
            email,
            'taken@email.com',
          );
          email.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const timer = setTimeout(() => {
          host.current?.querySelector('form')?.requestSubmit();
        }, 0);

        return () => clearTimeout(timer);
      }, []);

      return (
        <div ref={host}>
          <SettingsScreen {...args} />
        </div>
      );
    }

    return <Demo />;
  },
};

/**
 * The expired session, which is the only failure on this form that carries a control.
 *
 * The first version of this arm named a control the signed-in shell does not publish, so the only
 * way to follow its advice discarded the edits the sentence promised were still savable. The link
 * opens in a new tab deliberately: the action does not `redirect()` precisely so a dead session
 * does not destroy a half-edited form, and signing in elsewhere sets the cookie for this origin, so
 * coming back and pressing Save works.
 *
 * Worth reviewing as a story because it is the one place a link sits inside an error line, and
 * `link link-primary` deliberately keeps its own colour rather than inheriting `text-error`.
 */
export const SessionExpired: Story = {
  args: {
    save: async (): Promise<UpdateProfileResult> => ({ ok: false, reason: 'unauthenticated' }),
  },
  render: (args) => {
    function Demo() {
      const host = useRef<HTMLDivElement>(null);

      useEffect(() => {
        const first = host.current?.querySelector<HTMLInputElement>('#settings-first-name');

        if (first) {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
            first,
            'Ana',
          );
          first.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const timer = setTimeout(() => {
          host.current?.querySelector('form')?.requestSubmit();
        }, 0);

        return () => clearTimeout(timer);
      }, []);

      return (
        <div ref={host}>
          <SettingsScreen {...args} />
        </div>
      );
    }

    return <Demo />;
  },
};

/**
 * The success confirmation, the third state SET-5 draws nothing for.
 *
 * A polite `role="status"` line rather than a toast or a banner: it follows a round trip with
 * nothing else on screen changing, so it needs announcing, and assertive would interrupt for
 * something that went right.
 */
export const Saved: Story = {
  render: (args) => {
    function Demo() {
      const host = useRef<HTMLDivElement>(null);

      useEffect(() => {
        const first = host.current?.querySelector<HTMLInputElement>('#settings-first-name');

        if (first) {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
            first,
            'Ana',
          );
          first.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const timer = setTimeout(() => {
          host.current?.querySelector('form')?.requestSubmit();
        }, 0);

        return () => clearTimeout(timer);
      }, []);

      return (
        <div ref={host}>
          <SettingsScreen {...args} />
        </div>
      );
    }

    return <Demo />;
  },
};
