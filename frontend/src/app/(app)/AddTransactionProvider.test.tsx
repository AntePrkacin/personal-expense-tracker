import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import { AddTransactionButton } from './AddTransactionButton';
import { AddTransactionProvider, useAddTransaction } from './AddTransactionProvider';

// The provider's own contract: one modal for the shell, nothing fetched until it is opened, and
// a hook that refuses to work outside it.
//
// `next/navigation` is a package specifier, so the `@/` alias trap does not apply. The create
// action is not mocked at all - the modal is never submitted here, and `AddTransactionModal`'s
// own suite injects it as a prop.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const CATEGORIES = [
  { id: '0198c2a1-0000-7000-8000-0000000000a1', name: 'Groceries' },
  { id: '0198c2a1-0000-7000-8000-0000000000ff', name: 'Uncategorized' },
];

const originalFetch = global.fetch;

function respondWith(status: number, body: unknown = { categories: CATEGORIES }) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8, 12, 0));
  (useRouter as jest.Mock).mockReturnValue({ refresh: jest.fn() });
  respondWith(200);
});

afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
});

const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

/** Two triggers on one page, which is exactly the Transactions screen's situation. */
function Shell() {
  return (
    <AddTransactionProvider>
      <AddTransactionButton />
      <AddTransactionButton label="Add transaction →" variant="secondary" />
    </AddTransactionProvider>
  );
}

const triggers = () => screen.getAllByRole('button', { name: /Add transaction/ });

describe('the hook', () => {
  it('throws outside the provider rather than doing nothing', () => {
    // A no-op would be a wiring bug that ships silently. useSetupDraft makes the same call.
    function Orphan() {
      useAddTransaction();
      return null;
    }

    // React logs the error it re-throws, which is noise rather than information here.
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Orphan />)).toThrow(/AddTransactionProvider/);

    error.mockRestore();
  });
});

describe('before the first open', () => {
  it('renders no modal at all', () => {
    render(<Shell />);

    // Not merely closed: a closed <dialog> is display:none so queryByRole cannot see inside it,
    // but queryAllByText and queryAllByLabelText can - which would make every text query on
    // every screen ambiguous. (app)/pages.test.tsx depends on this.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    expect(screen.queryByText('Note (optional)')).not.toBeInTheDocument();
  });

  it('fetches nothing', () => {
    // The whole reason the read lives here rather than in each page.tsx or in the layout: a page
    // nobody adds a transaction from costs no request.
    const fetchMock = respondWith(200);

    render(<Shell />);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('opening', () => {
  it('opens the modal from either trigger', async () => {
    const u = user();
    render(<Shell />);

    await u.click(triggers()[1]!);

    expect(screen.getByRole('dialog', { name: 'Add transaction' })).toBeInTheDocument();
  });

  it('mounts exactly one dialog however many triggers there are', async () => {
    // The correctness requirement behind the provider. Two modals would mean two focus traps and
    // two copies of every ui/Field id, which makes getByLabelText ambiguous.
    const u = user();
    render(<Shell />);

    await u.click(triggers()[0]!);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getAllByLabelText('Amount')).toHaveLength(1);
  });

  it('reads the categories from the frontend’s own endpoint, uncached', async () => {
    const fetchMock = respondWith(200);
    const u = user();
    render(<Shell />);

    await u.click(triggers()[0]!);

    // The exact path, because it is a contract with app/api/categories/route.ts that nothing
    // else checks - lib/routes.ts deliberately does not declare it.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/categories', {
        cache: 'no-store',
      }),
    );
  });

  it('opens immediately rather than waiting for the read', async () => {
    // A button that does nothing for a round trip reads as broken. The modal has a designed
    // state for absent options - a disabled select - and none for "not open yet".
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;

    const u = user();
    render(<Shell />);
    await u.click(triggers()[0]!);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeDisabled();
  });

  it('fills the select once the options arrive', async () => {
    const u = user();
    render(<Shell />);

    await u.click(triggers()[0]!);

    await waitFor(() => expect(screen.getByLabelText('Category')).toBeEnabled());
    expect(screen.getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
  });

  it('re-reads on every open, so a category added elsewhere shows up', async () => {
    const fetchMock = respondWith(200);
    const u = user();
    render(<Shell />);

    await u.click(triggers()[0]!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    await u.click(triggers()[0]!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

describe('a failed read', () => {
  it.each([401, 503, 500])('explains itself on a %d', async (status) => {
    respondWith(status, null);
    const u = user();
    render(<Shell />);

    await u.click(triggers()[0]!);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't load your categories. Please close this and try again.",
    );
  });

  it('explains itself when the server is unreachable', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
    const u = user();
    render(<Shell />);

    await u.click(triggers()[0]!);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('explains itself when the body will not parse', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }) as unknown as typeof fetch;
    const u = user();
    render(<Shell />);

    await u.click(triggers()[0]!);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('starts clean on the next open rather than showing a stale failure', async () => {
    const u = user();
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
    render(<Shell />);

    await u.click(triggers()[0]!);
    await screen.findByRole('alert');
    await u.click(screen.getByRole('button', { name: 'Cancel' }));

    respondWith(200);
    await u.click(triggers()[0]!);

    await waitFor(() => expect(screen.getByLabelText('Category')).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('closing', () => {
  it('unmounts the modal so nothing of it is left in the tree', async () => {
    const u = user();
    render(<Shell />);
    await u.click(triggers()[0]!);

    await u.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
  });

  it('discards what was typed, so a reopen starts empty', async () => {
    // The modal is unmounted rather than hidden, so its state goes with it. AC7 says nothing is
    // saved; this is the other half - nothing is remembered either.
    const u = user();
    render(<Shell />);
    await u.click(triggers()[0]!);
    await u.type(screen.getByLabelText('Merchant'), 'Whole Foods');

    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    await u.click(triggers()[0]!);

    expect(screen.getByLabelText('Merchant')).toHaveValue('');
  });

  it('does not write a late read into a modal that was closed and reopened', async () => {
    // The generation guard. Without it, a slow first read could resolve after a second open and
    // overwrite that one's options - or repopulate a modal the user had closed.
    let settleFirst: (value: unknown) => void = () => {};
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (settleFirst = resolve)))
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ categories: [] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const u = user();
    render(<Shell />);
    await u.click(triggers()[0]!);
    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    await u.click(triggers()[0]!);

    // The first read lands now, for a generation that is no longer current.
    settleFirst({ ok: true, status: 200, json: async () => ({ categories: CATEGORIES }) });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('option', { name: 'Groceries' })).not.toBeInTheDocument();
  });
});

describe('the trigger', () => {
  it('takes its label and variant, for the entry points that draw it differently', () => {
    render(<Shell />);

    // TRN-9's card says "Add transaction"; DSH-9's teaser draws "Add transaction →".
    expect(screen.getByRole('button', { name: 'Add transaction →' })).toBeInTheDocument();
  });

  it('is a button rather than a link, because it opens a dialog', () => {
    render(<Shell />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
