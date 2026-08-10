import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useRef } from 'react';

import type { Profile } from '@/lib/profile';
import type { UpdateProfileResult } from '@/lib/updateProfile';

import { PreferencesProvider } from '../PreferencesProvider';

import type { CategoriesSummary } from './categoriesSummary';
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
// **All three of the frame's cards are here as of PET-48**, so read the two sentences this replaces
// - "Only the Profile card is here", then "Two of the frame's three cards are here" - as dated. A
// diff against the frame now runs the whole column: Profile, Preferences, the Categories summary,
// and the Save row.
//
// Two deliberate differences from the frame in the second card, both recorded where they are
// decided: currency is the budget field's left segment rather than a row of its own
// (`components/BudgetField.tsx`), and there is no "On track" status chip in the header, because
// Settings fetches no dashboard data to put behind one (`settings/PreferencesCard.tsx`). One in the
// third: its "Manage" is inert by product decision, so the story's button navigates nowhere
// (`settings/CategoriesSummaryCard.tsx`).
//
// **Every story goes through `Frame` and none may render `SettingsScreen` directly.** The Categories
// card calls `useMoney()`, which throws outside `PreferencesProvider` - and the provider cannot live
// in a `decorators` array, because the story smoke tests build each story from `render` or
// `meta.component` and never apply a meta's decorators, so a decorator would work in the browser and
// throw under Jest. `shellRender.tsx` records that split; `CategoriesScreen.stories.tsx` solves it
// the same way.

/** Frame 17's own values, so `Default` is a literal diff target. */
const PROFILE: Profile = {
  fullName: 'Marko Kovač',
  email: 'marko@email.com',
  currency: 'USD',
  monthlyBudget: 2000,
  monthStartDay: 1,
};

/** Frame `40:722`'s own figures, with the fallback already excluded from the count. */
const SUMMARY: CategoriesSummary = { count: 8, allocated: 1800, monthlyBudget: 2000 };

const accept = async (): Promise<UpdateProfileResult> => ({ ok: true });

/**
 * The screen inside the one piece of the shell it cannot do without.
 *
 * The provider's currency is read off the story's own profile rather than pinned to `USD`, so a
 * story changing one changes both - which is what `(app)/layout.tsx` does with the same profile, and
 * what stops a `EUR` story drawing euros in the budget field over dollars on the Categories card.
 */
function Frame(args: React.ComponentProps<typeof SettingsScreen>) {
  return (
    <PreferencesProvider currency={args.profile.currency}>
      <SettingsScreen {...args} />
    </PreferencesProvider>
  );
}

const meta: Meta<typeof SettingsScreen> = {
  title: 'Screens/17 Settings',
  component: SettingsScreen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
  args: { profile: PROFILE, summary: SUMMARY, save: accept, themePref: 'system' },
  // On `meta` for the browser, and repeated on every story below because the smoke harness reads
  // `story.render` or `meta.component` and never `meta.render`. Both are needed: without this one
  // Storybook's own docs page would render the bare component, and without the per-story ones the
  // Jest harness would.
  render: (args) => <Frame {...args} />,
};

export default meta;
type Story = StoryObj<typeof SettingsScreen>;

/**
 * The frame as drawn: three cards prefilled, initials "MK", and the page's single Save.
 *
 * The literal diff target for node `40:676`, and as of PET-48 it is the whole column rather than the
 * top of it.
 */
export const Default: Story = {
  render: (args) => <Frame {...args} />,
};

/**
 * A stored last name of nothing, which is the state `initials` and `shortName` both degrade for.
 *
 * Worth a story because the avatar is the one place on this card where a missing field is
 * *visible* rather than merely blank: the circle shows one letter, and the sidebar footer beside it
 * drops the trailing initial entirely. Reachable through the API, which validates the name as
 * non-empty only when the field is sent.
 */
export const SingleName: Story = {
  args: { profile: { ...PROFILE, fullName: 'Marko' } },
  render: (args) => <Frame {...args} />,
};

/** A long hyphenated name and a long address, against the two-column row and the `max-w-205` ceiling. */
export const LongValues: Story = {
  args: {
    profile: {
      ...PROFILE,
      fullName: 'Marija-Magdalena Kovačević-Horvat',
      email: 'marija.magdalena.kovacevic@example-company-mail.com',
    },
  },
  render: (args) => <Frame {...args} />,
};

/**
 * One category, which is AC2's singular (PET-48).
 *
 * Reachable rather than contrived: an account that has deleted everything it did not want is left
 * with one row plus the fallback this card does not count.
 */
export const SingleCategory: Story = {
  args: { summary: { count: 1, allocated: 200, monthlyBudget: 2000 } },
  render: (args) => <Frame {...args} />,
};

/**
 * No categories at all, and the state neither design draws (PET-48).
 *
 * The card excludes the `Uncategorized` fallback, so an account holding only that row reads "0
 * categories · $0 allocated of $2,000" - every word of it true, and none of it designed. This story
 * is what to put in front of a designer for it, alongside the unavailable line below.
 */
export const NoCategories: Story = {
  args: { summary: { count: 0, allocated: 0, monthlyBudget: 2000 } },
  render: (args) => <Frame {...args} />,
};

/**
 * The categories read having failed, which is the fourth state on this page with no frame behind it
 * (PET-48).
 *
 * The card keeps its heading and its button and says what is missing; the two cards above it stay
 * editable and still save, which is the whole reason `page.tsx` degrades this read rather than
 * throwing. Its one sentence is invented copy and owes A29 a sign-off with the rest.
 */
export const CategoriesUnavailable: Story = {
  args: { summary: null },
  render: (args) => <Frame {...args} />,
};

/**
 * A euro account, and the one story that proves money follows the profile across *both* new cards
 * (PET-47's budget field and PET-48's summary line).
 *
 * PET-47 made the switch re-denominate rather than convert - the amounts are integer cents with no
 * currency attached and there is no rate source - so `€2,000` here is the same stored number the
 * dollar stories draw.
 */
export const EuroAccount: Story = {
  args: { profile: { ...PROFILE, currency: 'EUR' } },
  render: (args) => <Frame {...args} />,
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
          <Frame {...args} />
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
          <Frame {...args} />
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
          <Frame {...args} />
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
          <Frame {...args} />
        </div>
      );
    }

    return <Demo />;
  },
};
