import { createElement } from 'react';
import { render } from '@testing-library/react';

import * as AddTransactionModal from './(app)/AddTransactionModal.stories';
import * as EditTransactionModal from './(app)/EditTransactionModal.stories';
import * as DashboardScreen from './(app)/dashboard/DashboardScreen.stories';
import * as DashboardScreenEmpty from './(app)/dashboard/DashboardScreenEmpty.stories';
import * as TransactionDetailScreen from './(app)/transactions/[id]/TransactionDetailScreen.stories';
import * as AddCategoryModal from './(app)/transactions/categories/AddCategoryModal.stories';
import * as CategoriesScreen from './(app)/transactions/categories/CategoriesScreen.stories';
import * as TransactionsList from './(app)/transactions/TransactionsList.stories';
import * as TransactionsScreen from './(app)/transactions/TransactionsScreen.stories';
import * as VerifyFailedScreen from './auth/verify/failed/VerifyFailedScreen.stories';
import * as CheckEmailScreen from './check-email/CheckEmailScreen.stories';
import * as ErrorScreen from './ErrorScreen.stories';
import * as LoginScreen from './login/LoginScreen.stories';
import * as SetupCategoriesScreen from './setup/categories/SetupCategoriesScreen.stories';
import * as SetupRegisterScreen from './setup/register/SetupRegisterScreen.stories';
import * as SetupBudgetScreen from './setup/SetupBudgetScreen.stories';
import * as WelcomeScreen from './WelcomeScreen.stories';

// 02 Setup reaches useRouter through BudgetForm, and jsdom has no App Router, so
// rendering its stories here needs the mock below.
//
// Note this is the **opposite** call from (app)/shell.stories.test.tsx, which
// records that SidebarNav must not get a story at all because there is no router
// in context under Jest. The difference is what the story is for: SidebarNav is a
// wrapper whose only job is reading the pathname, while 02 Setup is a whole frame
// to diff against Figma. So here the router is mocked rather than the story
// skipped. The two notes are halves of one decision.
//
// `replace` joins `push` as of PET-29: frame 06's search field and its three filter selects
// all write the query string with it.
//
// `refresh` joins both as of PET-37. No story calls it - frame 19's `WithMessages` submits a form
// that fails validation, so it returns before the request - but every modal in this section reads it
// out of `useRouter()` on render, and a stub that omits a method the component destructures is a
// trap waiting for the first story that does reach the happy path.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

// Smoke-tests the Screens section's stories, the same job
// src/components/ui/ui.stories.test.tsx does for Components and
// src/app/(app)/shell.stories.test.tsx for Shell.
// `storybook build` bundles a story but never runs one, so without this a runtime
// throw ships through a green CI and surfaces only when somebody opens Storybook.
//
// Its own file rather than an entry in one of the others because each of those
// asserts its own title prefix - /^Components\//, /^Shell\// - and that assertion
// is the one thing each exists to make unambiguous.
//
// **The ~30 lines below are one copy of a harness every section's suite repeats**,
// past the lift-it-into-a-helper threshold. Lifting the existing suites was out of
// scope for the ticket that added this one; see the story-smoke-harness entry in
// docs/TODO.md for the helper's shape.

type Args = Record<string, unknown>;
type Story = { render?: (args: Args, context: never) => React.ReactNode; args?: Args };
type Meta = { title?: string; component?: React.ElementType; args?: Args };
type StoryModule = Record<string, unknown> & { default: Meta };

const MODULES: [name: string, module: StoryModule][] = [
  ['WelcomeScreen', WelcomeScreen as StoryModule],
  ['SetupBudgetScreen', SetupBudgetScreen as StoryModule],
  ['SetupCategoriesScreen', SetupCategoriesScreen as StoryModule],
  ['SetupRegisterScreen', SetupRegisterScreen as StoryModule],
  ['LoginScreen', LoginScreen as StoryModule],
  ['CheckEmailScreen', CheckEmailScreen as StoryModule],
  // The one module here with no Figma frame behind it (A38), which is also what makes
  // its stories the only place the screen can be looked at.
  ['VerifyFailedScreen', VerifyFailedScreen as StoryModule],
  // The second module here with no frame behind it, and the only screen in the app that no
  // route path reaches: `app/error.tsx` renders it when any route throws, so these two
  // stories are the only place its copy can be looked at.
  ['ErrorScreen', ErrorScreen as StoryModule],
  // The first signed-in screen in this section, and the first module here that lives
  // under `(app)/`. It is filed under Screens rather than Shell because frame 07 is a
  // whole frame, where `Shell/Page header` is one band of chrome shared by four - so
  // the section follows what the story is for, not which folder it sits in.
  ['TransactionsScreen', TransactionsScreen as StoryModule],
  // Frame 06, the populated half of the same screen. A second module rather than two more
  // stories in the one above, because a module carries one title and that one is frame 07's.
  ['TransactionsList', TransactionsList as StoryModule],
  // Frame 09, and the first *modal* in this section. Filed under Screens for the same
  // reason frame 07 is - it is a whole frame worth diffing - while `Shell/Modal` holds
  // the empty box those frames share. The two are not duplicates: one is the chrome,
  // this one is the form inside it.
  ['AddTransactionModal', AddTransactionModal as StoryModule],
  // Frame 11, the same five fields prefilled. A separate module for the module-carries-one-title
  // reason above, and the pairing is worth noticing: 09 and 11 are the two halves PET-32
  // deliberately did not merge into one component with a `mode` prop.
  ['EditTransactionModal', EditTransactionModal as StoryModule],
  // Frame 08. Three of its five stories are states the frame draws no variant for - an
  // uncapped category, one over its cap, and a transaction with no note - which makes this
  // module the review surface for them rather than only a diff against the design.
  ['TransactionDetailScreen', TransactionDetailScreen as StoryModule],
  // Frame 04, PET-21's own. All five of its slots are real cards as of PET-25; each card's own
  // states are reviewed under its own `Shell/...` story (`Shell/Budget card`,
  // `Shell/Spending trend`, `Shell/Spending by category`, `Shell/Recent transactions`,
  // `Shell/AI insight teaser`), and this module carries the one combination that matches node
  // 22:55.
  ['DashboardScreen', DashboardScreen as StoryModule],
  // Frame 05, PET-26's own. A second module rather than a second story in the one above, the
  // same module-carries-one-title reason `TransactionsList`/`TransactionsScreen` split on:
  // `CategoryDonut` takes no `isEmpty` prop at all, so building this frame inline in
  // `DashboardScreen.stories.tsx` would mean one file constructing the grid two different ways.
  ['DashboardScreenEmpty', DashboardScreenEmpty as StoryModule],
  // Frame 13, PET-36's own, and **it was missing from this list rather than deliberately absent**.
  // PET-37 registered it while adding the module below, because the omission is exactly what this
  // suite exists to catch: `storybook build` bundles a story without running one, so an unregistered
  // module's runtime throw ships through a green CI. Its header's "Add category" is live in the story,
  // with no provider, which is what `AddCategoryButton` owning its own state buys.
  ['CategoriesScreen', CategoriesScreen as StoryModule],
  // Frame 19, PET-37's own, and the third modal here. Filed under Screens for the reason frames 09
  // and 11 are, while `Shell/Modal` holds the empty box all three share. Its `WithMessages` story is
  // the A29 artifact: it puts both validation lines in front of a designer at once, which an
  // untouched form cannot do, because a blank budget is valid and only the name is wrong.
  ['AddCategoryModal', AddCategoryModal as StoryModule],
];

const stories = MODULES.flatMap(([moduleName, module]) => {
  const meta = module.default;

  return Object.entries(module)
    .filter(([exportName]) => exportName !== 'default')
    .map(([exportName, value]) => {
      const story = value as Story;
      const args = { ...meta.args, ...story.args };

      const build = () =>
        story.render
          ? story.render(args, {} as never)
          : createElement(meta.component as React.ElementType, args);

      return [`${moduleName}/${exportName}`, build] as const;
    });
});

describe('screen stories', () => {
  it('finds stories in every module', () => {
    // Guards the discovery above: a meta with no `component` and stories with no
    // `render` would reduce this suite to zero cases and pass.
    expect(stories.length).toBeGreaterThanOrEqual(MODULES.length * 2);
    for (const [moduleName, module] of MODULES) {
      expect(stories.some(([id]) => id.startsWith(`${moduleName}/`))).toBe(true);
      expect(module.default.component).toBeDefined();
    }
  });

  it.each(MODULES)('%s is filed under Screens in the sidebar', (_name, module) => {
    // Not "Components", which mirrors the nine tiles on the Figma Components page,
    // and not "Shell", which is the signed-in chrome. These are whole frames.
    expect(module.default.title).toMatch(/^Screens\//);
  });

  it.each(stories)('%s renders without throwing', (_id, build) => {
    expect(() => render(<>{build()}</>)).not.toThrow();
  });
});
