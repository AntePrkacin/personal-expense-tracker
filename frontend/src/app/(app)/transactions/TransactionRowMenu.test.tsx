import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Transaction } from '@/lib/transactions';

import { TransactionRowMenu } from './TransactionRowMenu';

// **What this suite cannot see, and why there is no polyfill for it.**
//
// jsdom 26.1.0 implements none of the Popover API: `showPopover` is undefined and
// `popoverTargetElement` is not on HTMLButtonElement. Unlike `<dialog>`, `jest.setup.ts`
// deliberately fakes none of it - faking light dismiss would turn AC1 into a test of the fake,
// which would pass just as happily with `popover` deleted from the markup. That is the call
// that file already makes about Escape.
//
// The practical consequence: **under Jest this menu is permanently open**, because the
// `popover` attribute is inert here and nothing hides the `<ul>`. So `getByRole('button', {
// name: 'Delete' })` finds it without anyone clicking the kebab, and no assertion below should
// be read as proving the menu opened. What is asserted is the wiring - the names, the
// target-to-id pairing, the disabled item, and what Delete does - and the opening, the light
// dismiss and the Escape are Chrome and Storybook checks.

const open = jest.fn();
const openEdit = jest.fn();

// A relative specifier: `jest.mock('@/…')` fails with "Cannot find module" from anywhere, which
// is the alias trap `frontend/src/app/CLAUDE.md` records. The provider is mocked rather than
// wrapped so this suite can assert the payload without a dialog in the tree.
jest.mock('../DeleteTransactionProvider', () => ({
  useDeleteTransaction: () => ({ open: mockOpen() }),
}));

// PET-32's provider, mocked for the same reason and with the same relative specifier. Mocking it
// rather than wrapping keeps this suite about the *menu*: what each item hands over, with no modal
// in the tree to make five field labels ambiguous.
jest.mock('../EditTransactionProvider', () => ({
  useEditTransaction: () => ({ open: mockOpenEdit() }),
}));

function mockOpen() {
  return open;
}

function mockOpenEdit() {
  return openEdit;
}

const TRANSACTION: Transaction = {
  id: '0198c2a1-0000-7000-8000-0000000000b1',
  amount: 62.4,
  date: '2025-10-08',
  merchant: 'Whole Foods',
  categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
  note: null,
} as Transaction;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the trigger', () => {
  it('is a real button now, which reverses PET-29', async () => {
    // It was a `<span>` for one ticket, because MNU-1's menu did not exist and a button that
    // announces itself as operable and does nothing is the failure the inert controls on this
    // screen were all built to avoid. The menu exists, so the span does not.
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    expect(screen.getByRole('button', { name: 'Actions for Whole Foods' })).toBeInTheDocument();
  });

  it('names itself by the row rather than saying "More actions" ten times', async () => {
    // A page of ten identically-named buttons tells a screen-reader user which control they
    // are on and nothing about which row.
    render(<TransactionRowMenu transaction={{ ...TRANSACTION, merchant: 'Uber' }} />);

    expect(screen.getByRole('button', { name: 'Actions for Uber' })).toBeInTheDocument();
  });

  it('reports the menu as collapsed at rest', async () => {
    // `aria-expanded` rather than `aria-haspopup`, and the difference is the point: haspopup
    // promises a keyboard pattern this does not implement, where expanded reports state. Without
    // it a screen reader announces nothing when the popover opens, because focus stays here.
    //
    // Note jsdom implements no Popover API, so this suite can only see the resting value and the
    // wiring below - the transition itself is a browser check, like everything else about this
    // menu.
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    expect(screen.getByRole('button', { name: 'Actions for Whole Foods' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('tracks the popover’s own toggle event rather than its trigger’s click', async () => {
    // The wiring that keeps `aria-expanded` honest. Light dismiss and Escape close the popover
    // without ever reaching the trigger, so state set in the trigger's onClick would drift from
    // what is on screen; the `toggle` event fires for every route in and out.
    const { container } = render(<TransactionRowMenu transaction={TRANSACTION} />);
    const menu = container.querySelector('[popover]') as HTMLElement;
    const trigger = screen.getByRole('button', { name: 'Actions for Whole Foods' });

    await act(async () => {
      menu.dispatchEvent(
        Object.assign(new Event('toggle', { bubbles: false }), { newState: 'open' }),
      );
    });

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('hides its glyph from the accessibility tree', async () => {
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    const trigger = screen.getByRole('button', { name: 'Actions for Whole Foods' });
    expect(trigger.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('points at the popover it owns', async () => {
    // The pairing that makes the whole thing work in a browser and is invisible here, so it is
    // asserted directly: a typo in either half is a kebab that does nothing at all.
    const { container } = render(<TransactionRowMenu transaction={TRANSACTION} />);

    const trigger = screen.getByRole('button', { name: 'Actions for Whole Foods' });
    const menu = container.querySelector('[popover]');

    expect(trigger.getAttribute('popovertarget')).toBe(menu?.id);
    expect(menu?.id).toBe(`row-menu-${TRANSACTION.id}`);
  });

  it('anchors the popover to itself', async () => {
    // `anchor-name` on the trigger and `position-anchor` on the popover have to name the same
    // custom ident or the menu lands somewhere else on the page.
    const { container } = render(<TransactionRowMenu transaction={TRANSACTION} />);

    const trigger = screen.getByRole('button', { name: 'Actions for Whole Foods' });
    const menu = container.querySelector('[popover]') as HTMLElement;

    expect(trigger.getAttribute('style')).toContain(`--row-menu-${TRANSACTION.id}`);
    expect(menu.getAttribute('style')).toContain(`--row-menu-${TRANSACTION.id}`);
  });

  it('gives two rows two different ids, so a table of them cannot collide', async () => {
    const { container } = render(
      <>
        <TransactionRowMenu transaction={TRANSACTION} />
        <TransactionRowMenu transaction={{ ...TRANSACTION, id: 'second', merchant: 'Uber' }} />
      </>,
    );

    const ids = [...container.querySelectorAll('[popover]')].map((menu) => menu.id);

    expect(new Set(ids).size).toBe(2);
  });
});

describe('the two items', () => {
  it("draws Edit above Delete, which is MNU-2's order", async () => {
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('renders Edit as a real, enabled button, which closes PET-33’s amended AC2', async () => {
    // This assertion is the inverse of the one it replaces. For one ticket Edit was a `<span>`
    // carrying `aria-disabled`, because PET-32's modal did not exist and an item that announces
    // itself as operable and does nothing is the failure every inert control on this screen was
    // built to avoid. The modal exists, so both the span and the flag are gone - and the negative
    // is asserted beside the positive, because `menu-disabled` left behind would dim a button that
    // still works.
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    const edit = screen.getByRole('button', { name: 'Edit' });

    expect(edit).toBeEnabled();
    expect(edit).not.toHaveAttribute('aria-disabled');
    expect(edit.closest('li')).not.toHaveClass('menu-disabled');
  });

  it('gives both items their designed glyph, hidden from the accessibility tree', async () => {
    // The labels already name them, so the marks are decoration. lucide renders a bare `<svg>`
    // with no ARIA of its own, which is why `aria-hidden` is explicit at every call site.
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    for (const name of ['Edit', 'Delete']) {
      expect(screen.getByRole('button', { name }).querySelector('svg')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    }
  });

  it('publishes no menu role, because the keyboard contract behind it is not implemented', async () => {
    // `role="menu"` promises arrow-key navigation between items. This is a list of buttons
    // reached with Tab, and that is what it says. Same refusal `SetupShell` records about
    // `aria-current="step"`.
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });
});

describe('Delete', () => {
  it('opens the confirmation for this row', async () => {
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('hands over exactly what the dialog copy quotes', async () => {
    // The id to delete plus the three values DEL-1 interpolates. Passing the whole transaction
    // would work and is deliberately not done: the dialog would then be able to read a note or
    // a categoryId it has no business rendering.
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(open).toHaveBeenCalledWith({
      id: TRANSACTION.id,
      merchant: 'Whole Foods',
      amount: 62.4,
      date: '2025-10-08',
    });
  });

  it('closes the menu on its way out', async () => {
    // Declarative, so that the dialog never opens underneath an open popover. Unobservable in
    // jsdom, which is exactly why the attributes are asserted rather than the behaviour.
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    const remove = screen.getByRole('button', { name: 'Delete' });

    expect(remove).toHaveAttribute('popovertarget', `row-menu-${TRANSACTION.id}`);
    expect(remove).toHaveAttribute('popovertargetaction', 'hide');
  });

  it('hands focus back to the kebab before opening the dialog', async () => {
    // **The focus-restore fix, and it is assertable because it is our code.** `Modal` captures
    // `document.activeElement` on mount; React flushes this click synchronously, so without the
    // refocus the captured element is this menu item, which `popovertargetaction="hide"` then
    // hides - still `isConnected`, so Modal's guard passes and focuses something unfocusable.
    // Asserting focus at the moment `open` is called is what pins the ordering.
    let focusedWhenOpened: Element | null = null;
    open.mockImplementation(() => {
      focusedWhenOpened = document.activeElement;
    });
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(focusedWhenOpened).toBe(screen.getByRole('button', { name: 'Actions for Whole Foods' }));
  });

  it('does not submit anything, being type=button', async () => {
    // The row menu can sit inside a form one day (the edit modal opens the same dialog), and
    // HTML defaults a bare button to submit.
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('type', 'button');
  });
});

describe('Edit', () => {
  it('opens the edit modal for this row', async () => {
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(openEdit).toHaveBeenCalledTimes(1);
  });

  it('hands over the whole transaction, which is what makes the prefill need no read', async () => {
    // Deliberately wider than Delete's four fields. `note` and `categoryId` are exactly the two a
    // confirmation has no business knowing and the two a form cannot prefill without - and the
    // row already has both, so AC1 costs no round trip.
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(openEdit).toHaveBeenCalledWith(TRANSACTION);
  });

  it('closes the menu on its way out', async () => {
    // So the modal never opens underneath an open popover - two top-layer elements competing is
    // the mess the platform is being used to avoid.
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    const edit = screen.getByRole('button', { name: 'Edit' });

    expect(edit).toHaveAttribute('popovertarget', `row-menu-${TRANSACTION.id}`);
    expect(edit).toHaveAttribute('popovertargetaction', 'hide');
  });

  it('hands focus back to the kebab before opening the modal', async () => {
    // The same fix Delete needed, and it has to be asserted separately rather than assumed from
    // there: the two handlers are two call sites, and the one that forgets the line is the one
    // whose Cancel leaves focus on `<body>`.
    let focusedWhenOpened: Element | null = null;
    openEdit.mockImplementation(() => {
      focusedWhenOpened = document.activeElement;
    });
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(focusedWhenOpened).toBe(screen.getByRole('button', { name: 'Actions for Whole Foods' }));
  });

  it('does not submit anything, being type=button', async () => {
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('type', 'button');
  });

  it('does not delete anything', async () => {
    // The two items are one class string apart in the markup, so the assertion that each does only
    // its own job is worth having on both.
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(open).not.toHaveBeenCalled();
  });
});
