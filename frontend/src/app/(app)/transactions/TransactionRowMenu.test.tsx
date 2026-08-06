import { render, screen } from '@testing-library/react';
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

// A relative specifier: `jest.mock('@/…')` fails with "Cannot find module" from anywhere, which
// is the alias trap `frontend/src/app/CLAUDE.md` records. The provider is mocked rather than
// wrapped so this suite can assert the payload without a dialog in the tree.
jest.mock('../DeleteTransactionProvider', () => ({
  useDeleteTransaction: () => ({ open: mockOpen() }),
}));

function mockOpen() {
  return open;
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

  it('renders Edit as disabled rather than as a control that does nothing', async () => {
    // The amendment to AC2. PET-32's edit modal does not exist, so this says so instead of
    // looking operable - and it is not a `<button>`, so nothing can click it.
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    expect(screen.getByText('Edit')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
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

  it('does not submit anything, being type=button', async () => {
    // The row menu can sit inside a form one day (the edit modal opens the same dialog), and
    // HTML defaults a bare button to submit.
    render(<TransactionRowMenu transaction={TRANSACTION} />);

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('type', 'button');
  });
});
