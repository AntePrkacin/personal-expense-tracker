import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Category } from '../../../../lib/categories';

import { CategoryCardMenu } from './CategoryCardMenu';

// 18 Categories - Row menu. **jsdom 26.1.0 implements none of the Popover API** and
// `jest.setup.ts` deliberately polyfills none of it, unlike `<dialog>` - faking light dismiss
// would turn AC1 into a test of the fake, passing just as happily with `popover` deleted from the
// markup. So this menu is permanently "open" here, and what this suite pins is the **wiring**: the
// trigger's name, the target and id pairing, the anchor idents, Edit's disabled state, and that
// Delete opens the dialog with that card's values. Opening and closing are Chrome and Storybook
// checks.
//
// A relative specifier, because `jest.mock('@/...')` fails with "Cannot find module" from anywhere
// in this repo - the alias trap `frontend/src/app/CLAUDE.md` records - and the accompanying import
// names the same one.
const open = jest.fn();
jest.mock('./DeleteCategoryProvider', () => ({
  useDeleteCategory: () => ({ open }),
}));

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: '0198c2a1-0000-7000-8000-0000000000a1',
    name: 'Groceries',
    color: 'success',
    icon: 'shopping-basket',
    note: null,
    isFallback: false,
    monthlyCap: 500,
    spent: 397,
    transactionCount: 24,
    percentUsed: 79.4,
    remaining: 103,
    over: null,
    status: 'near',
    ...overrides,
  };
}

/** The account's fallback row, which AC6 protects. Uncapped, as every seeded fallback is. */
const FALLBACK = category({
  id: '0198c2a1-0000-7000-8000-0000000000a9',
  name: 'Uncategorized',
  isFallback: true,
  monthlyCap: null,
  percentUsed: null,
  remaining: null,
  status: 'uncapped',
});

const trigger = (name = 'Groceries') => screen.getByRole('button', { name: `Actions for ${name}` });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the trigger', () => {
  it('is named per card rather than a bare "More actions"', () => {
    // A grid of eight identical "More actions" buttons tells a reader which control they are on
    // and nothing about which card.
    render(<CategoryCardMenu category={category()} />);

    expect(trigger()).toBeInTheDocument();
  });

  it('no longer announces itself as unavailable, which is PET-36s half of this control', () => {
    render(<CategoryCardMenu category={category()} />);

    expect(trigger()).not.toHaveAttribute('aria-disabled');
    expect(trigger()).toBeEnabled();
  });

  it('reports the menu closed at rest', () => {
    render(<CategoryCardMenu category={category()} />);

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('follows the popovers own toggle event rather than its own click', async () => {
    // Read from the platform rather than tracked beside it, so `aria-expanded` cannot disagree
    // with a light dismiss or an Escape - neither of which routes through the trigger at all.
    render(<CategoryCardMenu category={category()} />);

    const menu = document.getElementById(trigger().getAttribute('popovertarget')!) as HTMLElement;

    await act(async () => {
      menu.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
    });

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });

  it('hides its glyph from the accessibility tree', () => {
    render(<CategoryCardMenu category={category()} />);

    expect(trigger().querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('points at the menu it opens', () => {
    render(<CategoryCardMenu category={category()} />);

    const menu = document.getElementById(trigger().getAttribute('popovertarget')!);

    expect(menu).not.toBeNull();
    expect(menu).toHaveAttribute('popover', 'auto');
  });

  it('pairs its anchor ident with the menus position anchor', () => {
    // Inline styles rather than classes: Tailwind's scanner compiles nothing from an interpolated
    // class, and `anchor-name` has no utility to interpolate in the first place.
    render(<CategoryCardMenu category={category()} />);

    const menu = document.getElementById(trigger().getAttribute('popovertarget')!)!;

    expect(trigger().getAttribute('style')).toContain('--category-menu-');
    expect(menu.getAttribute('style')).toContain('--category-menu-');
  });

  it('gives two cards two distinct ids, so a grid cannot collide', () => {
    render(
      <>
        <CategoryCardMenu category={category()} />
        <CategoryCardMenu category={category({ id: 'second', name: 'Transport' })} />
      </>,
    );

    expect(trigger().getAttribute('popovertarget')).not.toBe(
      trigger('Transport').getAttribute('popovertarget'),
    );
  });
});

describe('the two items', () => {
  it('lists Edit then Delete, in the frames order', () => {
    render(<CategoryCardMenu category={category()} />);

    const labels = screen
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((label) => label !== '');

    expect(labels).toEqual(['Edit', 'Delete']);
  });

  it('publishes no menu roles, because the keyboard contract is not implemented', () => {
    // Fourth refusal of the same kind in this app, after SetupShell, TransactionTabs and the two
    // pickers on this very screen.
    render(<CategoryCardMenu category={category()} />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });

  it('hides both glyphs from the accessibility tree', () => {
    render(<CategoryCardMenu category={category()} />);

    for (const name of ['Edit', 'Delete']) {
      const item = screen.getByRole('button', { name });
      expect(item.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });
});

describe('Edit', () => {
  it('announces that it is not available yet, which amends AC1', () => {
    // PET-38's modal does not exist. `menu-disabled` is the visible half of the `aria-disabled`
    // beside it, which is the one case this repo asserts a class string.
    render(<CategoryCardMenu category={category()} />);

    const edit = screen.getByRole('button', { name: 'Edit' });

    expect(edit).toHaveAttribute('aria-disabled', 'true');
    expect(edit.closest('li')).toHaveClass('menu-disabled');
  });

  it('stays in the tab order, because disabled would remove it', () => {
    render(<CategoryCardMenu category={category()} />);

    expect(screen.getByRole('button', { name: 'Edit' })).not.toBeDisabled();
  });

  it('opens nothing', async () => {
    render(<CategoryCardMenu category={category()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(open).not.toHaveBeenCalled();
  });
});

describe('Delete', () => {
  it('opens the confirmation with this cards id, name and count', async () => {
    render(<CategoryCardMenu category={category()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(open).toHaveBeenCalledWith({
      id: '0198c2a1-0000-7000-8000-0000000000a1',
      name: 'Groceries',
      transactionCount: 24,
    });
  });

  it('hands nothing the confirmation has no business rendering', async () => {
    // Three fields, where PET-38's Edit will hand over the whole category. A dialog quoting a cap,
    // a colour or a note would be rendering things it does not need.
    render(<CategoryCardMenu category={category({ note: 'a private note' })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(Object.keys(open.mock.calls[0]![0] as object).sort()).toEqual([
      'id',
      'name',
      'transactionCount',
    ]);
  });

  it('closes the menu declaratively on the way out', async () => {
    // So the dialog never opens underneath an open popover: two top-layer elements competing is
    // exactly the mess the platform is being used to avoid.
    render(<CategoryCardMenu category={category()} />);

    const remove = screen.getByRole('button', { name: 'Delete' });

    expect(remove).toHaveAttribute('popovertargetaction', 'hide');
    expect(remove).toHaveAttribute('popovertarget', trigger().getAttribute('popovertarget')!);
  });

  it('is type=button, so it can never submit anything it lands inside', () => {
    render(<CategoryCardMenu category={category()} />);

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('type', 'button');
  });

  it('hands focus back to the kebab before the dialog captures it', async () => {
    // `Modal` captures `document.activeElement` on mount and React flushes this click
    // synchronously, so without the refocus the captured element is the menu item that
    // `popovertargetaction="hide"` is about to hide inside a closed popover - still `isConnected`,
    // no longer focusable, and focus lands on `<body>` even on the Cancel path.
    let focusedWhenOpened: Element | null = null;
    open.mockImplementation(() => {
      focusedWhenOpened = document.activeElement;
    });
    render(<CategoryCardMenu category={category()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(focusedWhenOpened).toBe(trigger());
  });
});

describe('the fallback category (AC6)', () => {
  it('offers no Delete at all', () => {
    // Decided from `isFallback` rather than by letting the backend answer 409: a control whose
    // only outcome is an error message is the failure every inert control on this screen exists
    // to avoid.
    render(<CategoryCardMenu category={FALLBACK} />);

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('still draws the kebab and the disabled Edit', () => {
    // Which makes it a menu with nothing operable in it until PET-38 lands, recorded rather than
    // hidden. Still better than a kebab that opens nothing, and it announces its condition.
    render(<CategoryCardMenu category={FALLBACK} />);

    expect(trigger('Uncategorized')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-disabled', 'true');
  });
});
