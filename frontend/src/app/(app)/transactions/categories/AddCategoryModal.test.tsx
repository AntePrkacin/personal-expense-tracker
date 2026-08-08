import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import { CATEGORY_TILE } from '../../../../components/ui/categoryColour';
import type { CreateCategoryResult } from '../../../../lib/createCategory';
import type { Palette } from '../../../../lib/palette';

import { AddCategoryModal } from './AddCategoryModal';

// PET-37's acceptance suite. AC1, AC2, AC3, AC4 and AC7 live here.
//
// Four things this file deliberately does not assert, each because jsdom cannot see it and each
// named in the plan's verification steps instead: the two selects sitting **side by side** (layout,
// and `AddTransactionModal.test.tsx` does not assert its own Date/Merchant row either), the caret
// restore in the budget field, **Escape** and the focus trap (`jest.setup.ts` deliberately fakes
// neither), and which *colour* a glyph is painted in once composited.
//
// A package specifier, so the `@/` alias trap does not apply. The action is injected as a prop
// rather than mocked, which is `AddTransactionModal`'s pattern and means this file needs no module
// mock at all.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const refresh = jest.fn();
const onClose = jest.fn();
const create = jest.fn<Promise<CreateCategoryResult>, [unknown]>();

/**
 * Three colours and three icons, in a deliberately non-alphabetical order.
 *
 * **Not the real 16 and 64**, because no count is promised anywhere - see `lib/palette.ts`. Three is
 * the smallest number that can show an order was preserved rather than sorted, which is the actual
 * contract: the DTO documents both lists as "In admin order". Had this fixture reproduced the real
 * set, PET-65 taking the icons from 13 to 64 would have broken it for no reason.
 */
const PALETTE: Palette = {
  colors: [
    { token: 'success', label: 'Emerald' },
    { token: 'primary', label: 'Indigo' },
    { token: 'info', label: 'Sky' },
  ],
  icons: [
    { name: 'shopping-basket', label: 'Basket' },
    { name: 'tv', label: 'Television' },
    { name: 'car', label: 'Car' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ refresh });
  create.mockResolvedValue({ ok: true });
});

const user = () => userEvent.setup();

function open(props: Partial<React.ComponentProps<typeof AddCategoryModal>> = {}) {
  return render(
    <AddCategoryModal palette={PALETTE} create={create} onClose={onClose} {...props} />,
  );
}

const name = () => screen.getByLabelText('Name');
const budget = () => screen.getByLabelText('Monthly budget (optional)');
const colour = () => screen.getByLabelText('Color') as HTMLSelectElement;
const icon = () => screen.getByLabelText('Icon') as HTMLSelectElement;
const submit = () => screen.getByRole('button', { name: 'Add category' });

/**
 * The Note field, which is **not rendered** while `SHOWS_NOTE` is false.
 *
 * A `query` rather than a `get`, so it answers `null` instead of throwing - which is what lets the
 * hidden case be asserted rather than merely not exercised. Flip `SHOWS_NOTE` and this suite tells
 * you exactly which four cases need their expectations back.
 */
const note = () => screen.queryByLabelText('Note (optional)');

const values = (select: HTMLSelectElement) => Array.from(select.options).map((o) => o.value);
const labels = (select: HTMLSelectElement) => Array.from(select.options).map((o) => o.text);

/**
 * The `aria-hidden` preview, found structurally because none of it is in the accessibility tree.
 *
 * **Anchored on the `<p>` rather than on the wrapper's first `span`**, which is what it used to be:
 * adding the "Preview" label made that first span the *label*, so the old selector silently returned
 * the wrong element. Going through the row keeps the tile addressable however many captions the block
 * grows.
 */
const previewRow = () => document.querySelector('[aria-hidden="true"] > p') as HTMLElement;
const previewTile = () => previewRow().firstElementChild as HTMLElement;
const previewGlyph = () => previewTile().querySelector('svg');

describe('AC1: the modal and its fields', () => {
  it('opens as a dialog titled "Add category"', () => {
    open();

    expect(screen.getByRole('dialog', { name: 'Add category' })).toBeInTheDocument();
  });

  // **Four of CED-4's five, and the fifth is hidden on purpose.** `SHOWS_NOTE` is false because a
  // note surfaces on no screen once saved (A42), so the field waits for a category detail page. The
  // regex still names Note, so this asserts its *absence* from the order rather than merely not
  // looking for it - flip the flag and this case fails until 'Note (optional)' goes back on the end.
  it('draws four of CED-4’s five fields in order, the Note being hidden', () => {
    open();

    const drawn = screen
      .getAllByText(/^(Name|Monthly budget \(optional\)|Color|Icon|Note \(optional\))$/)
      .map((node) => node.textContent);

    expect(drawn).toEqual(['Name', 'Monthly budget (optional)', 'Color', 'Icon']);
  });

  it('renders no Note field at all while SHOWS_NOTE is false', () => {
    open();

    expect(note()).not.toBeInTheDocument();
  });

  // The deviation from the frame, pinned so it is a decision rather than a drift. Node 102:878 rings
  // the budget field, but it also draws every field already filled, so it is a mid-fill snapshot;
  // focus belongs on the first empty required field.
  it('opens with focus on Name rather than on the budget field the frame rings', () => {
    open();

    expect(name()).toHaveFocus();
  });

  // A12: required fields are marked only by the absence of "(optional)". With the Note hidden the
  // budget is the **only** label carrying the word, which makes it carry the whole optional-cap
  // decision on its own - and makes it the one label a reviewer must not "tidy" away.
  it('marks the budget optional, and nothing else', () => {
    open();

    expect(screen.getAllByText(/\(optional\)$/).map((n) => n.textContent)).toEqual([
      'Monthly budget (optional)',
    ]);
  });
});

describe('AC2: the colour and icon selects', () => {
  it('offers every palette colour, by the admin’s label, in the server’s order', () => {
    open();

    expect(values(colour())).toEqual(['success', 'primary', 'info']);
    expect(labels(colour())).toEqual(['Emerald', 'Indigo', 'Sky']);
  });

  it('offers every palette icon, by label, in the server’s order', () => {
    open();

    expect(values(icon())).toEqual(['shopping-basket', 'tv', 'car']);
    expect(labels(icon())).toEqual(['Basket', 'Television', 'Car']);
  });

  // Preselected rather than opened on a placeholder, unlike the Add transaction modal's Category
  // field - the frame draws a value in each and the DTO requires both.
  it('preselects the first of each rather than a placeholder', () => {
    open();

    expect(colour()).toHaveValue('success');
    expect(icon()).toHaveValue('shopping-basket');
  });

  it('previews the chosen colour through the same helper every tile in the app uses', async () => {
    const u = user();
    open();

    expect(previewTile()).toHaveClass(CATEGORY_TILE.success);

    await u.selectOptions(colour(), 'primary');

    expect(previewTile()).toHaveClass(CATEGORY_TILE.primary);
  });

  // Asserted as a *change* rather than against `lucide-tv`, so the test does not depend on lucide's
  // own class naming - only on the preview actually following the select.
  it('previews a different glyph when a different icon is chosen', async () => {
    const u = user();
    open();

    const before = previewGlyph()?.getAttribute('class');
    expect(before).toBeTruthy();

    await u.selectOptions(icon(), 'car');

    expect(previewGlyph()?.getAttribute('class')).not.toBe(before);
  });

  it('names the category in the preview, falling back before anything is typed', async () => {
    const u = user();
    open();

    expect(screen.getByText('New category')).toBeInTheDocument();

    await u.type(name(), 'Subscriptions');

    expect(screen.getByText('Subscriptions')).toBeInTheDocument();
    expect(screen.queryByText('New category')).not.toBeInTheDocument();
  });

  it('captions the preview so the tile is not an unlabelled ornament', () => {
    open();

    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  // Every fact in the preview is already announced by the three fields above it, so repeating it
  // would add a glyph with no text and three duplicated values. Same argument as the donut's ring.
  //
  // **The caption is inside the hidden block, not beside it**, which is the half worth pinning: a
  // "Preview" that stayed in the tree would announce a heading-like word and then nothing at all.
  it('keeps the whole preview, caption included, out of the accessibility tree', () => {
    open();

    expect(previewTile().closest('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.getByText('Preview').closest('[aria-hidden="true"]')).toBeInTheDocument();
  });
});

describe('AC3: validation', () => {
  it('keeps the modal open and creates nothing when the name is missing', async () => {
    const u = user();
    open();

    await u.click(submit());

    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  // The optional cap, at the level the user meets it. A blank budget is not a missing budget.
  it('accepts a blank budget, because a cap is optional', async () => {
    const u = user();
    open();

    await u.type(name(), 'Subscriptions');
    await u.click(submit());

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(screen.queryByText(/greater than 0/)).not.toBeInTheDocument();
  });

  it('rejects a budget of zero, which is not the same as no limit', async () => {
    const u = user();
    open();

    await u.type(name(), 'Subscriptions');
    await u.type(budget(), '0');
    await u.click(submit());

    expect(
      screen.getByText('Enter a budget greater than 0, or leave it blank for no limit.'),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('shows both messages at once when both fields are wrong', async () => {
    const u = user();
    open();

    await u.type(budget(), '0');
    await u.click(submit());

    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    expect(
      screen.getByText('Enter a budget greater than 0, or leave it blank for no limit.'),
    ).toBeInTheDocument();
  });

  it('clears a field’s message as soon as the user starts fixing that field', async () => {
    const u = user();
    open();

    await u.click(submit());
    expect(screen.getByText('Enter a name.')).toBeInTheDocument();

    await u.type(name(), 'S');

    expect(screen.queryByText('Enter a name.')).not.toBeInTheDocument();
  });
});

describe('AC4: a successful save', () => {
  // **No `note` key, and its absence is the point.** With the field hidden there is nothing to type
  // into, so every category is created without one - which is a state `CreateCategoryDto` already
  // documents, since `note` is optional there. `categoryForm.test.ts` keeps pinning the note's
  // trimming and omission directly on `toCreateCategoryBody`, so hiding the field cost that coverage
  // nothing: the conversion is still tested, only its input is no longer a control.
  it('sends exactly what the form describes, which now carries no note', async () => {
    const u = user();
    open();

    await u.type(name(), 'Subscriptions');
    await u.type(budget(), '250.00');
    await u.selectOptions(colour(), 'primary');
    await u.selectOptions(icon(), 'tv');
    await u.click(submit());

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: 'Subscriptions',
        color: 'primary',
        icon: 'tv',
        monthlyCap: 250,
      }),
    );
  });

  it('omits the cap and the note entirely when both are blank', async () => {
    const u = user();
    open();

    await u.type(name(), 'Subscriptions');
    await u.click(submit());

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(Object.keys(create.mock.calls[0]![0] as object).sort()).toEqual([
      'color',
      'icon',
      'name',
    ]);
  });

  // One call redraws the card grid, ticks the Categories tab badge and moves the allocation summary,
  // because all three come from the same server read (AC5's three surfaces).
  it('refreshes the route and closes the dialog', async () => {
    const u = user();
    open();

    await u.type(name(), 'Subscriptions');
    await u.click(submit());

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('disables the submit while the request is out, so a double click cannot create two', async () => {
    const u = user();
    let settle: (result: CreateCategoryResult) => void = () => {};
    create.mockReturnValue(new Promise((resolve) => (settle = resolve)));

    open();
    await u.type(name(), 'Subscriptions');
    await u.click(submit());

    expect(submit()).toBeDisabled();

    settle({ ok: true });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('when the save is rejected', () => {
  // One reason per arm of CreateCategoryResult, and `invalid` must not say "try again": a body the
  // DTO rejects will be rejected again forever.
  it.each([
    ['invalid', "We couldn't add this category. Please check the values and try again."],
    ['unauthenticated', 'Your session has expired. Log in again to save this.'],
    ['failed', "We couldn't add this category. Please try again."],
  ] as const)('shows the %s line', async (reason, message) => {
    const u = user();
    create.mockResolvedValue({ ok: false, reason });
    open();

    await u.type(name(), 'Subscriptions');
    await u.click(submit());

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('neither closes nor refreshes, so nothing typed is lost', async () => {
    const u = user();
    create.mockResolvedValue({ ok: false, reason: 'failed' });
    open();

    await u.type(name(), 'Subscriptions');
    await u.click(submit());

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(submit()).not.toBeDisabled();
  });
});

describe('AC7: closing without creating', () => {
  it('closes on Cancel', async () => {
    const u = user();
    open();

    await u.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('closes on the X', async () => {
    const u = user();
    open();

    await u.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('discards what was typed rather than saving it', async () => {
    const u = user();
    open();

    await u.type(name(), 'Subscriptions');
    await u.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(create).not.toHaveBeenCalled();
  });
});

describe('when the palette could not be read', () => {
  it('disables both selects and says why', () => {
    open({ palette: null });

    expect(colour()).toBeDisabled();
    expect(icon()).toBeDisabled();
    expect(
      screen.getByText("We couldn't load the colours and icons. Please close this and try again."),
    ).toBeInTheDocument();
  });

  // Before the field checks, deliberately: telling somebody to "Enter a name." on top of a failed
  // network read blames them for something they cannot fix from here.
  it('refuses to submit, and does not add a field message on top of the failure', async () => {
    const u = user();
    open({ palette: null });

    await u.click(submit());

    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByText('Enter a name.')).not.toBeInTheDocument();
  });

  it('still offers every way out', async () => {
    const u = user();
    open({ palette: null });

    await u.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
