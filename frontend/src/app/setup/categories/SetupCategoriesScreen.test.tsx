import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SETUP_DRAFT_KEY } from '../draft';
import { SetupDraftProvider } from '../SetupDraftProvider';
import { STARTER_CATEGORY_NAMES } from '../starterCategories';
import { SetupCategoriesScreen } from './SetupCategoriesScreen';

// AC1 to AC5 of PET-10.
//
// **No next/navigation mock, deliberately.** Step 1's suite needs one because
// BudgetForm calls useRouter(); this screen has no router in it at all, since both
// of its exits are links. If a mock ever becomes necessary here, that is the signal
// somebody turned Continue back into a conditional button.
//
// next/jest maps every .css import to an empty object, so nothing here can assert a
// rendered colour or size; class names are the only appearance signal, and that they
// generate CSS is proved in components/ui/utilities.test.ts.

/** U+2014, which Figma types and the repo normalises away. */
const EM_DASH = '—';

const SUPPORTING_COPY =
  "Choose what you'd like to track. Tap to toggle - you can always add or edit categories later.";

/** The screen inside the provider its steps always render within. */
function renderScreen() {
  return render(
    <SetupDraftProvider>
      <SetupCategoriesScreen />
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

  it('types the overline in the pressed accent, not the pill colour', () => {
    // Figma binds this line to Brand/Accent Pressed and the step pill 60px above it
    // to Brand/Accent. Swapping them is a one-token diff nothing else catches.
    renderScreen();

    expect(screen.getByText('STEP 2 OF 3').className).toContain('text-brand-accent-pressed');
    expect(screen.getByText('STEP 2 OF 3').className).toContain('text-overline');
  });

  it('renders exactly one page-level heading', () => {
    renderScreen();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('offers the ten chips in the designed order', () => {
    // The order is CAT-2's and the backend's both. Read off the accessible names, so
    // this fails if a chip's label stops matching the name a registration submits.
    renderScreen();

    const names = chips()
      .filter((button) => button.getAttribute('aria-pressed') !== null)
      .map((button) => button.textContent);

    expect(names).toEqual([...STARTER_CATEGORY_NAMES]);
  });

  it('starts with nothing selected', () => {
    // Frame 03 draws seven chips selected; that illustrates the state rather than
    // setting a default, and the product decision is that the user picks. If this
    // ever changes, EMPTY_DRAFT is where it changes - not here - or step 3 would
    // submit something step 2 never showed.
    renderScreen();

    for (const name of STARTER_CATEGORY_NAMES) {
      expect(chip(name)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('marks the second of three steps active', () => {
    // The three-state coverage lives in SetupShell.test.tsx; this only pins that
    // step 2 is what this screen asks for.
    const { container } = renderScreen();

    const dots = [...container.querySelectorAll('[aria-hidden="true"] > span')];
    expect(dots).toHaveLength(3);
    expect(dots[0]!.className).toContain('bg-border-strong');
    expect(dots[1]!.className).toContain('bg-brand-accent');
    expect(dots[2]!.className).toContain('bg-border-strong');
  });

  it('draws the wide card, which is the one thing frame 03 does differently', () => {
    const { container } = renderScreen();

    expect(container.querySelector('.shadow-card')!.className).toContain('w-150');
  });
});

describe('AC2: a chip toggles both ways', () => {
  it('selects on the first click and deselects on the second', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(chip('Groceries'));
    expect(chip('Groceries')).toHaveAttribute('aria-pressed', 'true');
    expect(storedCategories()).toEqual(['Groceries']);

    await user.click(chip('Groceries'));
    expect(chip('Groceries')).toHaveAttribute('aria-pressed', 'false');
    expect(storedCategories()).toEqual([]);
  });

  it('shows the checkmark and the tinted border while selected', async () => {
    // CAT-2's two visual signals. The state is carried by aria-pressed for a reader
    // and by these for everyone else, so both halves are worth pinning - and the
    // checkmark count is what proves only the clicked chip grew one.
    const user = userEvent.setup();
    const { container } = renderScreen();

    expect(container.querySelectorAll('svg')).toHaveLength(0);
    expect(chip('Bills').className).toContain('border-border-strong');

    await user.click(chip('Bills'));

    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(chip('Bills').className).toContain('border-brand-accent');
    expect(chip('Bills').className).toContain('bg-brand-accent-soft');
  });

  it('leaves the other nine chips alone', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(chip('Housing'));

    const pressed = chips().filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAccessibleName('Housing');
  });

  it('stores the selection in the designed order, not the click order', async () => {
    // What makes two equal selections equal strings, and what keeps the array inside
    // RegisterDto's @IsIn and @ArrayUnique whatever route the user took to it.
    const user = userEvent.setup();
    renderScreen();

    await user.click(chip('Other'));
    await user.click(chip('Groceries'));
    await user.click(chip('Health'));

    expect(storedCategories()).toEqual(['Groceries', 'Health', 'Other']);
  });

  it('keeps both selections when two chips are toggled in one tick', async () => {
    // Not reachable with a mouse - one click is one event, and the re-render between
    // them keeps every read fresh - which is exactly why it is worth a test: it was
    // reachable programmatically, and it silently kept only the last chip. The fix
    // is the updater form of patchDraft, and layout.test.tsx pins the mechanism.
    renderScreen();

    const groceries = chip('Groceries');
    const bills = chip('Bills');

    await Promise.resolve().then(() => {
      groceries.click();
      bills.click();
    });

    expect(chip('Groceries')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Bills')).toHaveAttribute('aria-pressed', 'true');
    expect(storedCategories()).toEqual(['Groceries', 'Bills']);
  });

  it('toggles from the keyboard as well as the pointer', async () => {
    // The chips are the only interactive thing on this screen, so a keyboard user
    // who cannot toggle them cannot use it at all.
    const user = userEvent.setup();
    renderScreen();

    chip('Transport').focus();
    await user.keyboard('{Enter}');

    expect(chip('Transport')).toHaveAttribute('aria-pressed', 'true');
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
    await user.click(chip('Subscriptions'));

    // Written on toggle rather than on Continue, which is why "carried forward"
    // needs no submit handler and no state of the picker's own.
    expect(storedCategories()).toEqual(['Dining out', 'Subscriptions']);
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
    await user.click(chip('Bills'));
    unmount();

    renderScreen();

    expect(chip('Groceries')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Bills')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Health')).toHaveAttribute('aria-pressed', 'false');
  });

  it('reads a selection that was already in storage before the first render', () => {
    sessionStorage.setItem(
      SETUP_DRAFT_KEY,
      JSON.stringify({ currency: 'USD', budget: '2,000', categories: ['Transport'] }),
    );

    renderScreen();

    expect(chip('Transport')).toHaveAttribute('aria-pressed', 'true');
  });

  it('leaves step 1s currency and budget untouched', async () => {
    // The other half of AC4, and the reason patchDraft merges rather than replaces.
    // Step 1 has no way to notice this going wrong: its own screen would still show
    // what it stored, and only the walk back would reveal the loss.
    sessionStorage.setItem(
      SETUP_DRAFT_KEY,
      JSON.stringify({ currency: 'USD', budget: '1,500.25', categories: [] }),
    );

    const user = userEvent.setup();
    renderScreen();

    await user.click(chip('Shopping'));

    expect(storedDraft()).toEqual({
      currency: 'USD',
      budget: '1,500.25',
      categories: ['Shopping'],
    });
  });

  it('does not persist anything before the user touches a chip', () => {
    // The provider must not write on mount, or the mount write would race its own
    // read and could overwrite a real draft with the empty one.
    renderScreen();

    expect(sessionStorage.getItem(SETUP_DRAFT_KEY)).toBeNull();
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
    await user.click(chip('Bills'));

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
  it('makes both exits links, with ten chips as the only buttons', () => {
    // The inverted mirror of step 1's one-link-one-button assertion. Continue here
    // *is* a link, because A4 leaves nothing to validate - so a regression to a form
    // with a submit button would be somebody inventing a validation seam the design
    // does not have. Ten buttons is what catches a chip being dropped or duplicated.
    renderScreen();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.textContent)).toEqual(['Back', 'Continue']);

    expect(chips()).toHaveLength(10);
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
