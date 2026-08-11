import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CategoryTemplate } from '@/lib/categoryTemplates';

import { SETUP_DRAFT_KEY } from '../draft';
import { SetupDraftProvider } from '../SetupDraftProvider';
import { STEP_DOT, STEP_WIDTH } from '../SetupShell';
import { CHIP_STATE } from './CategoryChip';
import { SetupCategoriesScreen } from './SetupCategoriesScreen';

// AC1 to AC5 of PET-10.
//
// **No next/navigation mock, deliberately.** Step 1's suite needs one because
// BudgetForm calls useRouter(); this screen has no router in it at all, since both
// of its exits are links. If a mock ever becomes necessary here, that is the signal
// somebody turned Continue back into a conditional button.
//
// next/jest maps every .css import to an empty object, so nothing here can assert a
// rendered colour or size; class names are the only appearance signal, and nothing
// proves they generate CSS since PET-57 retired the compile guard.
//
// **The chips are stand-in data as of PET-64, and every count is derived from it.**
// They used to be `STARTER_CATEGORY_NAMES`, imported, and this file said "the ten
// chips" and "the other nine" in several places. The offered list is admin-managed
// data the page fetches now, so a hard-coded count here would pin a number this
// screen no longer owns - it would fail on a seed change that broke nothing, and pass
// on a chip being dropped from a list of a different length. Counting `TEMPLATES`
// keeps the assertions about the *screen*.

/** U+2014, which Figma types and the repo normalises away. */
const EM_DASH = '—';

const SUPPORTING_COPY =
  "Choose what you'd like to track. Tap to toggle - you can always add or edit categories later.";

/**
 * The stand-in chips, shaped exactly as `GET /api/templates/categories` answers.
 *
 * Five rather than the seeded twelve: the suite asserts the screen's behaviour per
 * chip and across chips, and neither needs the whole list. Two of them share nothing
 * with the seed on purpose - `Alpha` and `Omega` - so a test that accidentally
 * depended on the real seed's names would fail here rather than pass by luck.
 */
const TEMPLATES: CategoryTemplate[] = [
  {
    id: 'id-groceries',
    name: 'Groceries',
    color: 'success',
    icon: 'shopping-basket',
    description: 'Food and household essentials.',
  },
  {
    id: 'id-dining',
    name: 'Dining out',
    color: 'secondary',
    icon: 'utensils',
    description: 'Restaurants and takeout.',
  },
  {
    id: 'id-transport',
    name: 'Transportation',
    color: 'info',
    icon: 'car',
    description: 'Gas, transit, parking.',
  },
  {
    id: 'id-alpha',
    name: 'Alpha',
    color: 'accent',
    icon: 'zap',
    description: 'A category no seed writes.',
  },
  {
    id: 'id-omega',
    name: 'Omega',
    color: 'warning',
    icon: 'landmark',
    description: 'Another one.',
  },
];

/** The screen inside the provider its steps always render within. */
function renderScreen(categories: CategoryTemplate[] = TEMPLATES) {
  return render(
    <SetupDraftProvider>
      <SetupCategoriesScreen categories={categories} />
    </SetupDraftProvider>,
  );
}

const chip = (name: string) => screen.getByRole('button', { name });
const chips = () => screen.getAllByRole('button');

const storedDraft = () => JSON.parse(sessionStorage.getItem(SETUP_DRAFT_KEY) ?? 'null');
const storedCategories = () => storedDraft()?.categories;

// Captured once, because AC5 replaces it. Restoring it per test keeps that case
// falsifiable: a leaked stub would make it pass whether or not the code fetches.
// Saved and reassigned rather than jest.spyOn'd, because jsdom does not guarantee a
// global fetch to spy on in the first place.
const originalFetch = global.fetch;

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('AC1: the card as designed', () => {
  it('shows the overline, heading and supporting copy', () => {
    renderScreen();

    expect(screen.getByText('STEP 2 OF 3')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Pick your categories' }),
    ).toBeInTheDocument();
    expect(screen.getByText(SUPPORTING_COPY)).toBeInTheDocument();
  });

  it('writes the copy with a hyphen rather than Figmas em dash', () => {
    // The repo already normalised U+2014 out of the currency label; the two
    // characters are indistinguishable in a diff, so the absence is asserted rather
    // than trusted.
    renderScreen();

    expect(screen.getByText(SUPPORTING_COPY).textContent).not.toContain(EM_DASH);
  });

  it('renders exactly one page-level heading', () => {
    renderScreen();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('offers every chip it was handed, in the order it was handed them', () => {
    // The order is the admin's `sort_order`, which the API returns and this screen
    // renders as given rather than sorting - CAT-2's rule with a new authority
    // behind it. Read off the accessible names, so this fails if a chip's label
    // stops matching the template it came from.
    renderScreen();

    const names = chips()
      .filter((button) => button.getAttribute('aria-pressed') !== null)
      .map((button) => button.textContent);

    expect(names).toEqual(TEMPLATES.map((template) => template.name));
  });

  it('renders the card with no chips when the templates could not be read', () => {
    // `readCategoryTemplates` degrades to an empty list rather than throwing, so
    // this is what an unreachable backend looks like: the copy, both exits, and
    // nothing to pick. Continue is unconditional (A4), so the flow still completes.
    renderScreen([]);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Pick your categories' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('starts with nothing selected', () => {
    // Frame 03 draws seven chips selected; that illustrates the state rather than
    // setting a default, and the product decision is that the user picks. If this
    // ever changes, EMPTY_DRAFT is where it changes - not here - or step 3 would
    // submit something step 2 never showed.
    renderScreen();

    for (const template of TEMPLATES) {
      expect(chip(template.name)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('marks the second of three steps active', () => {
    // The three-state coverage lives in SetupShell.test.tsx; this only pins that
    // step 2 is what this screen asks for. Matched against STEP_DOT rather than a
    // hand-written copy of its classes, which is what kept this passing through the
    // theme change.
    const { container } = renderScreen();

    const dots = [...container.querySelectorAll('[aria-hidden="true"] > span')];
    expect(dots).toHaveLength(3);
    expect(dots[0]!.className).toContain(STEP_DOT.inactive);
    expect(dots[1]!.className).toContain(STEP_DOT.active);
    expect(dots[2]!.className).toContain(STEP_DOT.inactive);
  });

  it('draws the wide card, which is the one thing frame 03 does differently', () => {
    // Frame 03 is 600px against the other two frames' 520, now a `max-w-*` ceiling
    // so the card can still shrink. SetupShell.test.tsx owns the per-step table; this
    // pins that the screen asks for step 2's entry.
    const { container } = renderScreen();

    expect(container.querySelector(`.${STEP_WIDTH[2].split(' ').join('.')}`)).not.toBeNull();
  });
});

describe('AC2: a chip toggles both ways', () => {
  it('selects on the first click and deselects on the second', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(chip('Groceries'));
    expect(chip('Groceries')).toHaveAttribute('aria-pressed', 'true');
    // Ids, not names: `RegisterDto.categories` takes `category_templates.id`.
    expect(storedCategories()).toEqual(['id-groceries']);

    await user.click(chip('Groceries'));
    expect(chip('Groceries')).toHaveAttribute('aria-pressed', 'false');
    expect(storedCategories()).toEqual([]);
  });

  it('shows the checkmark and the tinted treatment while selected', async () => {
    // CAT-2's two visual signals. The state is carried by aria-pressed for a reader
    // and by these for everyone else, so both halves are worth pinning - and the
    // checkmark count is what proves only the clicked chip grew one. The treatment
    // itself is CategoryChip's, so it is read from the map rather than restated.
    const user = userEvent.setup();
    const { container } = renderScreen();

    expect(container.querySelectorAll('svg')).toHaveLength(0);
    expect(chip('Alpha').className).toContain(CHIP_STATE.off);

    await user.click(chip('Alpha'));

    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(chip('Alpha').className).toContain(CHIP_STATE.on);
  });

  it('leaves every other chip alone', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(chip('Omega'));

    const pressed = chips().filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAccessibleName('Omega');
  });

  it('stores the selection in the offered order, not the click order', async () => {
    // What makes two equal selections equal strings, and what keeps the array
    // inside `RegisterDto`'s `@ArrayUnique` whatever route the user took to it.
    // The order used to be a constant's; it is the fetched list's now, which is
    // the same property with a different authority behind it.
    const user = userEvent.setup();
    renderScreen();

    await user.click(chip('Omega'));
    await user.click(chip('Groceries'));
    await user.click(chip('Transportation'));

    expect(storedCategories()).toEqual(['id-groceries', 'id-transport', 'id-omega']);
  });

  it('keeps both selections when two chips are toggled in one tick', async () => {
    // Not reachable with a mouse - one click is one event, and the re-render between
    // them keeps every read fresh - which is exactly why it is worth a test: it was
    // reachable programmatically, and it silently kept only the last chip. The fix
    // is the updater form of patchDraft, and layout.test.tsx pins the mechanism.
    renderScreen();

    const groceries = chip('Groceries');
    const alpha = chip('Alpha');

    await Promise.resolve().then(() => {
      groceries.click();
      alpha.click();
    });

    expect(chip('Groceries')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Alpha')).toHaveAttribute('aria-pressed', 'true');
    expect(storedCategories()).toEqual(['id-groceries', 'id-alpha']);
  });

  it('toggles from the keyboard as well as the pointer', async () => {
    // The chips are the only interactive thing on this screen, so a keyboard user
    // who cannot toggle them cannot use it at all.
    const user = userEvent.setup();
    renderScreen();

    chip('Transportation').focus();
    await user.keyboard('{Enter}');

    expect(chip('Transportation')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('AC3: Continue carries the selection to Register', () => {
  it('links to step 3', () => {
    renderScreen();

    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute(
      'href',
      '/setup/register',
    );
  });

  it('holds the selection in the draft the next step reads', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(chip('Dining out'));
    await user.click(chip('Alpha'));

    // Written on toggle rather than on Continue, which is why "carried forward"
    // needs no submit handler and no state of the picker's own.
    expect(storedCategories()).toEqual(['id-dining', 'id-alpha']);
  });

  it('still continues with nothing selected', () => {
    // A4: no minimum is enforced anywhere in the design, so an empty selection is a
    // choice rather than an error. This is also why Continue can be a link at all -
    // there is no validation that could need to block it.
    renderScreen();

    expect(screen.getByRole('link', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.queryByText(/at least/i)).not.toBeInTheDocument();
  });
});

describe('AC4: Back keeps both steps values', () => {
  it('links to step 1', () => {
    renderScreen();

    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/setup');
  });

  it('comes back with the same chips toggled after the screen unmounts', async () => {
    // AC4 literally. Going back to /setup and forward again unmounts this subtree
    // and mounts it afresh; an unmount and a second render are exactly those two
    // events, with no router needed to stage them.
    const user = userEvent.setup();
    const { unmount } = renderScreen();

    await user.click(chip('Groceries'));
    await user.click(chip('Alpha'));
    unmount();

    renderScreen();

    expect(chip('Groceries')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Alpha')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Omega')).toHaveAttribute('aria-pressed', 'false');
  });

  it('reads a selection that was already in storage before the first render', () => {
    sessionStorage.setItem(
      SETUP_DRAFT_KEY,
      JSON.stringify({ currency: 'EUR', budget: '2,000', categories: ['id-transport'] }),
    );

    renderScreen();

    expect(chip('Transportation')).toHaveAttribute('aria-pressed', 'true');
  });

  it('leaves step 1s currency and budget untouched', async () => {
    // The other half of AC4, and the reason patchDraft merges rather than replaces.
    // Step 1 has no way to notice this going wrong: its own screen would still show
    // what it stored, and only the walk back would reveal the loss.
    sessionStorage.setItem(
      SETUP_DRAFT_KEY,
      JSON.stringify({ currency: 'EUR', budget: '1,500.25', categories: [] }),
    );

    const user = userEvent.setup();
    renderScreen();

    await user.click(chip('Alpha'));

    expect(storedDraft()).toEqual({
      currency: 'EUR',
      budget: '1,500.25',
      categories: ['id-alpha'],
      fullName: '',
      monthStartDay: 1,
      email: '',
    });
  });

  it('does not persist anything before the user touches a chip', () => {
    // The provider must not write on mount, or the mount write would race its own
    // read and could overwrite a real draft with the empty one.
    renderScreen();

    expect(sessionStorage.getItem(SETUP_DRAFT_KEY)).toBeNull();
  });
});

describe('a stored pick that is no longer offered', () => {
  // The membership filter `parseDraft` lost at PET-64, restored where the two
  // halves actually meet. That module used to drop a value the picker could not
  // have produced; with an admin-managed list it is React-free and fetches
  // nothing, so it only dedupes and caps now.
  //
  // Left unreconciled, a dead id rides the draft to step 3, `AuthService`
  // answers 400 and `RegisterForm` renders its generic failure line - and the
  // draft is untouched by a rejected submit, so every retry sends the same dead
  // id and the one control that could clear it is a chip the screen no longer
  // draws. The user cannot leave onboarding without emptying sessionStorage.

  const withStored = (categories: string[]) =>
    sessionStorage.setItem(
      SETUP_DRAFT_KEY,
      JSON.stringify({ currency: 'EUR', budget: '2,000', categories }),
    );

  it('drops the dead id and keeps the live ones', async () => {
    withStored(['id-groceries', 'id-retired', 'id-omega']);

    renderScreen();

    await waitFor(() => expect(storedCategories()).toEqual(['id-groceries', 'id-omega']));
  });

  it('rewrites the survivors in the offered order', async () => {
    // Same rebuild `toggle` does, so a reconciled draft and a toggled one are
    // canonical in the same way rather than in two subtly different ways.
    withStored(['id-omega', 'id-retired', 'id-groceries']);

    renderScreen();

    await waitFor(() => expect(storedCategories()).toEqual(['id-groceries', 'id-omega']));
  });

  it('leaves the rest of the draft alone', async () => {
    withStored(['id-retired']);

    renderScreen();

    await waitFor(() => expect(storedCategories()).toEqual([]));
    expect(storedDraft()).toMatchObject({ currency: 'EUR', budget: '2,000' });
  });

  it('writes nothing at all when every stored id is still offered', async () => {
    // The ordinary visit. The effect is guarded on "would this change
    // anything", so it must not cost a sessionStorage write per render - and
    // must not fight the provider's own no-write-on-mount rule.
    renderScreen();

    await waitFor(() => expect(chips().length).toBeGreaterThan(0));
    expect(sessionStorage.getItem(SETUP_DRAFT_KEY)).toBeNull();
  });

  it('never reconciles against an empty list, which is the degraded read', async () => {
    // **The exception that matters most.** `readCategoryTemplates` degrades to
    // `[]` rather than throwing, so "no chips" means "the backend could not be
    // read" as much as it means "an admin disabled everything" - deliberately
    // indistinguishable, because Continue is unconditional (A4). Reconciling
    // here would read a momentary outage as proof that every chip the user
    // picked is gone and silently delete a correct selection.
    withStored(['id-groceries', 'id-omega']);

    renderScreen([]);

    await waitFor(() => expect(screen.getByRole('heading')).toBeInTheDocument());
    expect(storedCategories()).toEqual(['id-groceries', 'id-omega']);
  });
});

describe('AC5: nothing reaches a server', () => {
  it('sends no request when chips are toggled', async () => {
    // A32: the account does not exist until step 3 posts one body, so there is
    // nothing here to save to. Made falsifiable two ways, since a fetch spy alone
    // would miss a native form post.
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof global.fetch;

    const user = userEvent.setup();
    const { container } = renderScreen();

    await user.click(chip('Groceries'));
    await user.click(chip('Alpha'));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.querySelector('form')).toBeNull();
  });

  it('keeps the selection in this tab only', () => {
    // sessionStorage rather than localStorage, and nothing else. A shared machine
    // must not offer the next person a half-finished registration.
    renderScreen();

    expect(localStorage.length).toBe(0);
  });
});

describe('the exits', () => {
  it('makes both exits links, with the chips as the only buttons', () => {
    // The inverted mirror of step 1's one-link-one-button assertion. Continue here
    // *is* a link, because A4 leaves nothing to validate - so a regression to a form
    // with a submit button would be somebody inventing a validation seam the design
    // does not have. One button per offered chip is what catches a chip being
    // dropped or duplicated; the number used to be the literal ten, which is a fact
    // about a constant this screen no longer owns.
    renderScreen();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.textContent)).toEqual(['Back', 'Continue']);

    expect(chips()).toHaveLength(TEMPLATES.length);
    for (const button of chips()) {
      expect(button).toHaveAttribute('aria-pressed');
    }
  });

  it('carries no password field, here or anywhere in onboarding', () => {
    // A31: access is passwordless and no frame draws a password field. Cheap to
    // assert on every access screen, and the one regression nobody would question.
    const { container } = renderScreen();

    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it('has no form, so Enter cannot submit anything', () => {
    // Enter on a chip toggles it. There is nothing to submit, which is the whole
    // shape of this screen.
    const { container } = renderScreen();

    expect(container.querySelector('form')).toBeNull();
  });
});
