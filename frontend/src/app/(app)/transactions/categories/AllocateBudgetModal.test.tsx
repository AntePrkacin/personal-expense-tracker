import { act, screen, within } from '@testing-library/react';

import { render } from '../../shellRender';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import type { Allocation, Category } from '@/lib/categories';
import { moneyFormatters } from '@/lib/money';
import type { UpdateCategoryCapsResult } from '@/lib/updateCategoryCaps';

import {
  ALLOCATE_EMPTY,
  ALLOCATE_HINT,
  AllocateBudgetModal,
  cappedMessage,
} from './AllocateBudgetModal';
import { MAX_CAP_ROWS, type toAllocateBody } from './allocateForm';
import { category, FALLBACK_CATEGORY, UNCAPPED_CATEGORY } from './categoryFixture';

/** The formatters the shell's provider would hand the modal; see `PreferencesProvider`. */
const USD = moneyFormatters('USD');

// The Allocate budget modal. The arithmetic is `allocateForm.test.ts`'s, driven with no DOM at all;
// what is here is the wiring - the fields, the messages, the save and its five arms.
//
// **Escape, the focus trap and the internal scroll are not asserted here**, deliberately.
// `jest.setup.ts` polyfills only `showModal()` and `close()`, and faking the rest would turn an
// acceptance criterion into a test of the fake. They are browser checks, listed in the plan.
//
// The only module mock is `next/navigation`, and the save arrives as a `jest.fn()` prop - which is
// what the seam exists for, and what avoids the `@/` alias trap `jest.mock` cannot resolve.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const save = jest.fn<Promise<UpdateCategoryCapsResult>, [ReturnType<typeof toAllocateBody>]>();
const onClose = jest.fn();
const refresh = jest.fn();

// MANDATORY with fake timers on: without `advanceTimers` every `userEvent` call waits on a real
// clock this suite has stopped, and the failure is a five-second timeout rather than an assertion.
const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

const SNAP_MS = 3_400;

/** Budget 2,000 with 1,150 already capped, so 850 is genuinely unassigned. */
const ALLOCATION: Allocation = { monthlyBudget: 2000, allocated: 1150, unallocated: 850 };

const CATEGORIES: Category[] = [
  category({ name: 'Groceries', monthlyCap: 500, spent: 397 }),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000b2',
    name: 'Dining out',
    monthlyCap: 300,
    spent: 312,
  }),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000b3',
    name: 'Transport',
    monthlyCap: 350,
    spent: 223,
  }),
  UNCAPPED_CATEGORY,
  FALLBACK_CATEGORY,
];

const renderModal = (overrides: Partial<Parameters<typeof AllocateBudgetModal>[0]> = {}) =>
  render(
    <AllocateBudgetModal
      categories={CATEGORIES}
      allocation={ALLOCATION}
      save={save}
      onClose={onClose}
      {...overrides}
    />,
  );

const capField = (name: string) => screen.getByLabelText(`Monthly cap for ${name}`);
const saveButton = () => screen.getByRole('button', { name: 'Save caps' });
const cancelButton = () => screen.getByRole('button', { name: 'Cancel' });

/**
 * The snap region's text, which is not the same question as whether the region exists.
 *
 * It is mounted from the first render and stays mounted empty, deliberately: a live region created
 * in the same commit as its content is generally not announced at all. So every assertion about the
 * message has to read its text rather than its presence, and `queryByRole('status')` can no longer
 * say anything about whether a snap happened.
 */
const snapMessage = () => screen.getByRole('status').textContent;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (useRouter as jest.Mock).mockReturnValue({ refresh });
  save.mockResolvedValue({ ok: true });
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('AC1-AC4: the modal opens on the current allocation', () => {
  it('names itself and draws one field per allocatable category', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Allocate your budget' })).toBeInTheDocument();
    expect(capField('Groceries')).toHaveValue('500.00');
    expect(capField('Dining out')).toHaveValue('300.00');
    expect(capField('Transport')).toHaveValue('350.00');
  });

  it('leaves an uncapped category blank rather than at zero', () => {
    renderModal();

    expect(capField('Subscriptions')).toHaveValue('');
    expect(capField('Subscriptions')).toHaveAttribute('placeholder', 'No limit');
  });

  it('shows the ledger and the default hint', () => {
    renderModal();

    expect(screen.getByText('Left to assign')).toBeInTheDocument();
    expect(screen.getByText('Monthly budget')).toBeInTheDocument();
    expect(screen.getByText('Assigned to categories')).toBeInTheDocument();
    expect(screen.getByText(ALLOCATE_HINT)).toBeInTheDocument();
  });

  it('captions a row whose spend is over its own cap', () => {
    renderModal();

    // Dining out is $312 against $300. The overage carries cents where the spend does not - see
    // the sub-dollar case below for why.
    expect(screen.getByText('$312 spent · $12.00 over this cap')).toBeInTheDocument();
    expect(screen.getByText('$397 spent')).toBeInTheDocument();
  });

  it('states a sub-dollar overage exactly rather than rounding it to nothing', () => {
    // A review of PET-70 found this: `formatWhole` on a *residual* rendered "$0 over this cap" in
    // `text-error`, a red warning asserting the row is not over. The reverse case rounded a
    // 50-cent overage up to "$1", double the real figure.
    renderModal({
      categories: [category({ name: 'Groceries', monthlyCap: 100, spent: 100.01 })],
    });

    expect(screen.getByText('$100 spent · $0.01 over this cap')).toBeInTheDocument();
  });

  it('mounts the snap region empty rather than creating it with its message', () => {
    // **The one assertion here that is about assistive technology rather than about text.** A polite
    // live region inserted in the same commit as its content is generally not announced: the region
    // has to exist first and then mutate. So it ships mounted and empty, and this pins that - which
    // `queryByRole('status')` returning null cannot distinguish from the defect.
    renderModal();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(snapMessage()).toBe('');
  });
});

describe('nothing to allocate to', () => {
  it('explains itself rather than drawing an empty list under a column header', () => {
    // Reachable: `Uncategorized` cannot be deleted and is not a row, so an account that deleted
    // every other category has its whole budget unassigned - the banner draws - over a modal with no
    // fields. Found by a review; no story covered it.
    renderModal({
      categories: [FALLBACK_CATEGORY],
      allocation: { monthlyBudget: 2000, allocated: 0, unallocated: 2000 },
    });

    expect(screen.getByText(ALLOCATE_EMPTY)).toBeInTheDocument();
    expect(screen.queryByText('Monthly cap')).not.toBeInTheDocument();
    // The hint is advice about fields that are not there.
    expect(screen.queryByText(ALLOCATE_HINT)).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });
});

describe('AC11: Uncategorized is not a row', () => {
  it('draws no field for the fallback', () => {
    renderModal();

    expect(screen.queryByLabelText('Monthly cap for Uncategorized')).not.toBeInTheDocument();
  });

  it('still counts a cap the fallback carries, so the ledger reconciles', async () => {
    // Reachable through the API even though this UI cannot set it. Without the derived reserve the
    // remainder here would read $850 and disagree with the backend's own `unallocated`.
    renderModal({
      categories: [...CATEGORIES.slice(0, 4), { ...FALLBACK_CATEGORY, monthlyCap: 60 }],
      allocation: { monthlyBudget: 2000, allocated: 1210, unallocated: 790 },
    });

    expect(screen.getByText('$1,210')).toBeInTheDocument();
    expect(screen.getAllByText('$790').length).toBeGreaterThan(0);
  });
});

describe('AC5-AC7: the caps can never sum above the monthly budget', () => {
  it('snaps a field down to what is left and says why', async () => {
    renderModal();

    // Groceries may hold 2000 - (300 + 350) = 1,350 at most.
    await user().clear(capField('Groceries'));
    await user().type(capField('Groceries'), '4000');

    expect(capField('Groceries')).toHaveValue('1,350.00');
    expect(snapMessage()).toBe(cappedMessage(135000, 200000, USD));
  });

  it('never lets the remainder go negative or turn red', async () => {
    renderModal();

    await user().clear(capField('Groceries'));
    await user().type(capField('Groceries'), '4000');

    // Every dollar assigned, and nothing anywhere reporting a negative.
    expect(screen.queryByText(/−|-\$/)).not.toBeInTheDocument();
    expect(screen.getAllByText('$0').length).toBeGreaterThan(0);
  });

  it('lowers no other row while clamping the one being typed into', async () => {
    renderModal();

    await user().clear(capField('Groceries'));
    await user().type(capField('Groceries'), '9999');

    expect(capField('Dining out')).toHaveValue('300.00');
    expect(capField('Transport')).toHaveValue('350.00');
    expect(capField('Subscriptions')).toHaveValue('');
  });

  it('changes nothing on open, even with the budget fully within reach', () => {
    // The invariant AC7 states: a clamp applied on mount rather than on change would rewrite caps
    // the user never touched, and every gate would stay green.
    renderModal();

    expect(capField('Groceries')).toHaveValue('500.00');
    expect(capField('Dining out')).toHaveValue('300.00');
    expect(save).not.toHaveBeenCalled();
  });

  it('clears the field and says why when nothing is left to assign', async () => {
    // A browser walk found this: snapping to a ceiling of zero writes a cap of `0`, which the DTO
    // rejects - so the app planted an invalid value nobody typed and then answered "Enter an amount
    // greater than 0" as though they had. The field is cleared instead, which is valid *and* true.
    renderModal({
      allocation: { monthlyBudget: 1150, allocated: 1150, unallocated: 0 },
    });

    // One keystroke, deliberately. Typing '50' would be two: the '5' is what this asserts on, and
    // the '0' after it is a *user-typed* zero, which `wanted <= ceiling` legitimately accepts at a
    // ceiling of zero and `isCapValid` then rejects on submit - the same as typing 0 into any other
    // amount field in this app.
    await user().type(capField('Subscriptions'), '5');

    expect(capField('Subscriptions')).toHaveValue('');
    expect(snapMessage()).toContain('Nothing left to assign');
    // And the form is still saveable rather than poisoned by a zero nobody typed.
    expect(screen.queryByText(/greater than 0/)).not.toBeInTheDocument();
  });

  it('frees a cleared row’s budget for the others', async () => {
    renderModal();

    await user().clear(capField('Dining out'));
    // Groceries may now hold 2000 - 350 = 1,650.
    await user().clear(capField('Groceries'));
    await user().type(capField('Groceries'), '1700');

    expect(capField('Groceries')).toHaveValue('1,650.00');
  });
});

describe('the capped message', () => {
  const snap = async () => {
    await user().clear(capField('Groceries'));
    await user().type(capField('Groceries'), '4000');
  };

  it('reverts to the hint after roughly 3.4 seconds', async () => {
    renderModal();
    await snap();

    expect(snapMessage()).not.toBe('');

    act(() => {
      jest.advanceTimersByTime(SNAP_MS);
    });

    // The region stays mounted and empties. Removal from a live region announces nothing, which is
    // what keeps the revert silent.
    expect(snapMessage()).toBe('');
    expect(screen.getByText(ALLOCATE_HINT)).toBeInTheDocument();
  });

  it('restarts the window when a second snap lands inside it', async () => {
    renderModal();
    await snap();

    act(() => {
      jest.advanceTimersByTime(3_000);
    });

    // A second snap on another row, 3s into the first message's window.
    await user().clear(capField('Transport'));
    await user().type(capField('Transport'), '9999');

    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    // Still there: the identity change restarted the timer rather than inheriting 400ms.
    expect(snapMessage()).not.toBe('');
  });

  it('quotes the capped amount to the cent and the budget whole', async () => {
    // Mixed precision on purpose: the capped figure must match the field beside it, which routinely
    // carries cents, while the budget must match the summary card behind the modal.
    renderModal({
      allocation: { monthlyBudget: 2000.5, allocated: 1150, unallocated: 850.5 },
    });

    await user().clear(capField('Groceries'));
    await user().type(capField('Groceries'), '4000');

    expect(snapMessage()).toContain('$1,350.50');
    expect(snapMessage()).toContain('$2,001');
  });
});

describe('the ledger column adds up', () => {
  it('derives the remainder from the rounded pair rather than rounding it too', () => {
    // The defect a review of PET-70 found. Rounding all three figures independently printed
    // "Monthly budget $2,001 / Assigned $1,000 / Unassigned $1,000" - two rows summing to $2,000
    // under a stated $2,001, in a column drawn with a rule above the total. Both figures are legal.
    renderModal({
      categories: [category({ name: 'Groceries', monthlyCap: 1000.25, spent: 0 })],
      allocation: { monthlyBudget: 2000.5, allocated: 1000.25, unallocated: 1000.25 },
    });

    const figures = ['Monthly budget', 'Assigned to categories', 'Unassigned'].map(
      (label) => screen.getByText(label).nextElementSibling?.textContent,
    );

    expect(figures).toEqual(['$2,001', '$1,000', '$1,001']);
  });

  it('shows the headline the same figure as the Unassigned row', () => {
    renderModal({
      categories: [category({ name: 'Groceries', monthlyCap: 1000.25, spent: 0 })],
      allocation: { monthlyBudget: 2000.5, allocated: 1000.25, unallocated: 1000.25 },
    });

    // Two nodes, one figure: the headline and the column cannot disagree because both read
    // `toAllocateTotals`.
    expect(screen.getAllByText('$1,001')).toHaveLength(2);
  });
});

describe('AC9-AC10: the save', () => {
  it('sends only the rows that changed', async () => {
    renderModal();

    await user().clear(capField('Transport'));
    await user().type(capField('Transport'), '250');
    await user().click(saveButton());

    expect(save).toHaveBeenCalledWith({
      categories: [{ id: CATEGORIES[2].id, monthlyCap: 250 }],
    });
  });

  it('sends null for a cleared cap', async () => {
    renderModal();

    await user().clear(capField('Groceries'));
    await user().click(saveButton());

    expect(save).toHaveBeenCalledWith({
      categories: [{ id: CATEGORIES[0].id, monthlyCap: null }],
    });
  });

  it('refreshes and closes on success', async () => {
    renderModal();

    await user().clear(capField('Transport'));
    await user().type(capField('Transport'), '250');
    await user().click(saveButton());

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('disables Save until a cap really changed', async () => {
    renderModal();

    expect(saveButton()).toBeDisabled();

    await user().clear(capField('Transport'));
    await user().type(capField('Transport'), '250');

    expect(saveButton()).toBeEnabled();
  });

  it('treats a reformatting as no change at all', async () => {
    renderModal();

    // '500.00' retyped as '500' is the same cap.
    await user().clear(capField('Groceries'));
    await user().type(capField('Groceries'), '500');

    expect(saveButton()).toBeDisabled();
  });

  it('leaves Cancel live while a save is in flight', async () => {
    // No fetch in this app carries a timeout, so a hung request is exactly when a way out matters.
    renderModal();
    save.mockReturnValue(new Promise(() => {}));

    await user().clear(capField('Transport'));
    await user().type(capField('Transport'), '250');
    await user().click(saveButton());

    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});

describe('validation', () => {
  it('reports every offending row at once, and sends nothing', async () => {
    renderModal();

    await user().clear(capField('Groceries'));
    await user().type(capField('Groceries'), '0');
    await user().clear(capField('Transport'));
    await user().type(capField('Transport'), '0');
    await user().click(saveButton());

    expect(screen.getAllByText(/greater than 0/)).toHaveLength(2);
    expect(save).not.toHaveBeenCalled();
  });

  it('points the field at its own message', async () => {
    renderModal();

    await user().clear(capField('Groceries'));
    await user().type(capField('Groceries'), '0');
    await user().click(saveButton());

    const field = capField('Groceries');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(/greater than 0/);
  });

  it('clears a row’s message on the next keystroke in it', async () => {
    renderModal();

    await user().clear(capField('Groceries'));
    await user().type(capField('Groceries'), '0');
    await user().click(saveButton());
    await user().type(capField('Groceries'), '5');

    expect(screen.queryByText(/greater than 0/)).not.toBeInTheDocument();
  });
});

describe('the four failures', () => {
  const submitChange = async () => {
    await user().clear(capField('Transport'));
    await user().type(capField('Transport'), '250');
    await user().click(saveButton());
  };

  it.each([
    ['invalid', /check the amounts/i],
    ['missing', /no longer exists/i],
    ['unauthenticated', /session has expired/i],
    ['failed', /try again/i],
  ] as const)('reports %s without refreshing behind itself', async (reason, copy) => {
    renderModal();
    save.mockResolvedValue({ ok: false, reason });

    await submitChange();

    // `findBy`, not `getBy`: the handler awaits the action, so the state this asserts on lands a
    // microtask after `click` resolves. The sibling modal suites use `waitFor` for the same reason.
    expect(await screen.findByRole('alert')).toHaveTextContent(copy);
    // The modal stays open on every arm: the user has a screen of edits in front of them and this
    // line is what explains why they could not be saved.
    expect(onClose).not.toHaveBeenCalled();
    // **No arm refreshes while the dialog is open, `missing` included.** A review of PET-70 found the
    // refresh it used to fire here able to unmount this dialog through the banner's own
    // `unallocated > 0` gate - taking the message it had just set and every unsaved cap with it.
    expect(refresh).not.toHaveBeenCalled();
  });

  it('disables Save after a stale-list failure, so the same payload cannot 404 twice', async () => {
    // The draft is read once on open and never resynced, so the retry the copy invites re-sends the
    // dead id and can only fail identically. A review found that looping with no way out but the
    // Close that discards every edit.
    renderModal();
    save.mockResolvedValue({ ok: false, reason: 'missing' });

    await submitChange();
    await screen.findByRole('alert');

    expect(saveButton()).toBeDisabled();

    // And no keystroke re-enables it: nothing the user types makes a deleted category exist.
    await user().type(capField('Groceries'), '5');

    expect(saveButton()).toBeDisabled();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('re-reads the list on the way out after a stale-list failure', async () => {
    // What the copy promises - "close this to see the current list" - delivered at the close rather
    // than in front of the open dialog.
    renderModal();
    save.mockResolvedValue({ ok: false, reason: 'missing' });

    await submitChange();
    await screen.findByRole('alert');
    await user().click(cancelButton());

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not re-read on the way out after any other failure', async () => {
    renderModal();
    save.mockResolvedValue({ ok: false, reason: 'failed' });

    await submitChange();
    await screen.findByRole('alert');
    await user().click(cancelButton());

    expect(refresh).not.toHaveBeenCalled();
  });

  it('refuses a payload past the endpoint’s own row limit rather than sending it', async () => {
    // `@ArrayMaxSize(100)` answers 400, which classifies as `invalid` - whose copy asks the user to
    // check amounts that are every one of them valid. The message names the real limit instead.
    renderModal({
      categories: Array.from({ length: MAX_CAP_ROWS + 1 }, (_, index) =>
        category({
          id: `0198c2a1-0000-7000-8000-${index.toString().padStart(12, '0')}`,
          name: `Category ${index}`,
          monthlyCap: 1,
          spent: 0,
        }),
      ),
      allocation: { monthlyBudget: 1_000_000, allocated: MAX_CAP_ROWS + 1, unallocated: 999_899 },
    });

    for (const field of screen.getAllByLabelText(/^Monthly cap for /)) {
      await user().clear(field);
      await user().type(field, '2');
    }
    await user().click(saveButton());

    expect(screen.getByRole('alert')).toHaveTextContent(`Only ${MAX_CAP_ROWS} limits`);
    expect(save).not.toHaveBeenCalled();
  });

  it('freezes the cap fields while a save is in flight', async () => {
    // The body is serialised at press time and the success path closes the dialog, so a keystroke
    // during the round trip was silently discarded - the modal closed on a limit never sent.
    renderModal();
    save.mockReturnValue(new Promise(() => {}));

    await submitChange();

    expect(capField('Groceries')).toBeDisabled();
    expect(capField('Transport')).toBeDisabled();
    // Cancel deliberately stays live: no fetch in this app carries a timeout.
    expect(cancelButton()).toBeEnabled();
  });

  it('recovers from a Server Action that never resolves at all', async () => {
    // Not defensive: a transport that never completes **rejects** rather than resolving, and a
    // rejection escaping the handler leaves `pending` true for good - which disables Save and kills
    // Enter with it.
    renderModal();
    save.mockRejectedValue(new Error('Connection closed'));

    await submitChange();

    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i);
    expect(saveButton()).toBeEnabled();
  });
});

describe('the allocation bar', () => {
  it('is hidden from assistive technology, with every figure restated as text', () => {
    // A stacked bar has no single value to report, and the ledger above it names all of them - so
    // the bar is decoration. Asserted by containment rather than by a text query, because RTL reads
    // straight through `aria-hidden` and a text assertion would pass either way.
    const { container } = renderModal();
    const bar = container.querySelector('[aria-hidden="true"].flex.h-2');

    expect(bar).not.toBeNull();
    expect(within(bar as HTMLElement).queryByText(/\$/)).not.toBeInTheDocument();
  });
});
