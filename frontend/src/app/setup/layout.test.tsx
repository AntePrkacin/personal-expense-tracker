import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { redirect } from 'next/navigation';

import { hasSession } from '../../lib/session';

import { SETUP_DRAFT_KEY } from './draft';
import { useSetupDraft } from './SetupDraftProvider';
import SetupLayout from './layout';

// The setup layout has two lines that matter, and both fail in ways no other test
// in this suite would notice: delete the provider and every step still renders
// its own markup, then throws the moment a field is touched; delete the gate and
// onboarding is silently reachable with a live session again. Same reasoning
// `(app)/layout.test.tsx` records for its own.
//
// Relative specifiers on the mocks, because `jest.mock` cannot resolve the `@/`
// alias from any directory - see the note in frontend/src/app/CLAUDE.md - and the
// import above names the same one.
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

jest.mock('../../lib/session', () => ({ hasSession: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  (hasSession as jest.Mock).mockResolvedValue(false);
});

/**
 * The layout, awaited.
 *
 * It became an async Server Component when PET-52 gave it the session gate, so it is
 * called and awaited rather than rendered as an element - the same shape
 * `(app)/layout.test.tsx` uses. Every case below is about what happens *inside* the
 * provider, so the change is mechanical rather than interesting.
 */
async function renderSetup(children: React.ReactNode) {
  return render(await SetupLayout({ children }));
}

/** Reads the draft the way a real step does, so the wiring is what is under test. */
function DraftProbe() {
  const { draft } = useSetupDraft();
  return <p>currency: {draft.currency}</p>;
}

describe('SetupLayout', () => {
  it('provides the draft to its children', async () => {
    // The whole point. Remove SetupDraftProvider from layout.tsx and this throws
    // "useSetupDraft must be used inside a SetupDraftProvider", which is the loud
    // failure the hook's own error message exists to give.
    await renderSetup(<DraftProbe />);

    expect(screen.getByText('currency: EUR')).toBeInTheDocument();
  });

  it('renders its children', async () => {
    await renderSetup(<p>step content</p>);

    expect(screen.getByText('step content')).toBeInTheDocument();
  });

  it('renders no chrome of its own', async () => {
    // The logo, the step indicator and the card belong to SetupShell, which each
    // step renders with its own `step`. If they ever move here, the active dot
    // becomes unreachable: a layout cannot read the pathname on the server.
    const { container } = await renderSetup(<p>step content</p>);

    expect(screen.queryAllByRole('heading')).toHaveLength(0);
    expect(screen.queryByText('Spendifico')).not.toBeInTheDocument();
    // One child, the page. Nothing wrapping, nothing beside it.
    expect(container.innerHTML).toBe('<p>step content</p>');
  });

  it('sets no segment config, even though it is dynamic now', () => {
    // Still the inverse of (app)/layout.tsx's assertion, and now for a second reason:
    // PET-52's `cookies()` read opts this segment out of static rendering on its own,
    // so `force-dynamic` here would be a claim about nothing - exactly as it became a
    // claim about nothing in the shell, where it was deleted.
    const segment: Record<string, unknown> = jest.requireActual('./layout');
    expect(segment.dynamic).toBeUndefined();
  });
});

describe('the session gate', () => {
  // docs/TODO.md handed this and /login to PET-52 "in the same breath", and they got the
  // same answer. Onboarding was reachable by typed URL with a live session, so a
  // signed-in user could re-run it - harmless, since nothing persists until step 3, but
  // pointless.

  it('sends a signed-in visitor to the Dashboard', async () => {
    (hasSession as jest.Mock).mockResolvedValue(true);

    await SetupLayout({ children: null });

    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('lets a signed-out visitor through', async () => {
    await renderSetup(<p>step content</p>);

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByText('step content')).toBeInTheDocument();
  });

  it('gates once for all three steps rather than per page', async () => {
    // The reason it lives on the layout: three call sites are three places to forget
    // one, and the two later steps are the ones somebody would.
    await renderSetup(<p>step content</p>);

    expect(hasSession).toHaveBeenCalledTimes(1);
  });
});

describe('patchDraft', () => {
  /** Exposes both halves of the context so a patch can be driven from a click. */
  function DraftEditor() {
    const { draft, patchDraft } = useSetupDraft();
    return (
      <>
        <p>
          {draft.currency} / {draft.budget}
        </p>
        <button onClick={() => patchDraft({ budget: '2,000' })}>set budget</button>
        <button onClick={() => patchDraft({ currency: 'EUR' })}>set currency</button>
      </>
    );
  }

  beforeEach(() => {
    sessionStorage.clear();
  });

  it('merges one field without clobbering the other', async () => {
    // The property PET-10 depends on: step 2 writing its categories must not wipe
    // step 1's budget. Covered here rather than through the currency select, which
    // has one option (A6) and so cannot fire its own onChange at all - that
    // handler is unreachable until the option list grows.
    const user = userEvent.setup();
    await renderSetup(<DraftEditor />);

    await user.click(screen.getByRole('button', { name: 'set budget' }));
    expect(screen.getByText('EUR / 2,000')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'set currency' }));

    expect(screen.getByText('EUR / 2,000')).toBeInTheDocument();
  });

  it('persists the merged draft, not just the patch', async () => {
    const user = userEvent.setup();
    await renderSetup(<DraftEditor />);

    await user.click(screen.getByRole('button', { name: 'set budget' }));
    await user.click(screen.getByRole('button', { name: 'set currency' }));

    expect(JSON.parse(sessionStorage.getItem(SETUP_DRAFT_KEY)!)).toEqual({
      currency: 'EUR',
      budget: '2,000',
      monthStartDay: 1,
      categories: [],
      fullName: '',
      email: '',
    });
  });

  /** Accumulates into a list, the way step 2's chips do. */
  function ListEditor() {
    const { draft, patchDraft } = useSetupDraft();

    /** Both appends, from one handler, so they land in a single tick. */
    function appendTwice() {
      patchDraft((current) => ({ categories: [...current.categories, 'Groceries'] }));
      patchDraft((current) => ({ categories: [...current.categories, 'Bills'] }));
    }

    return (
      <>
        <p>picked: {draft.categories.join(',')}</p>
        <button onClick={appendTwice}>append twice</button>
      </>
    );
  }

  it('applies two patches in one tick without either overwriting the other', async () => {
    // The reason `patchDraft` takes an updater at all, and a case a real browser
    // hides: one click is one event, so a re-render lands between two chip toggles
    // and a value read during render is still fresh. Batch them - a fast synthetic
    // sequence, a future "select all", anything wrapping toggles in a transition -
    // and a render-time read makes the second patch start from the pre-first draft
    // and silently drop a selection. Reading storage inside patchDraft is what
    // makes that impossible rather than unlikely.
    const user = userEvent.setup();
    await renderSetup(<ListEditor />);

    await user.click(screen.getByRole('button', { name: 'append twice' }));

    expect(screen.getByText('picked: Groceries,Bills')).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(SETUP_DRAFT_KEY)!).categories).toEqual([
      'Groceries',
      'Bills',
    ]);
  });
});

describe('clearDraft', () => {
  /** Exposes all three members, so a clear and a later patch can both be driven. */
  function DraftClearer() {
    const { draft, patchDraft, clearDraft } = useSetupDraft();
    return (
      <>
        <p>
          {draft.budget} / {draft.fullName}
        </p>
        <button onClick={() => patchDraft({ budget: '2,000', fullName: 'Marko' })}>fill</button>
        <button onClick={() => patchDraft({ fullName: 'Marko' })}>set name</button>
        <button onClick={clearDraft}>clear</button>
      </>
    );
  }

  beforeEach(() => {
    sessionStorage.clear();
  });

  it('empties the slot and every field rendering from it', async () => {
    // Step 3 calls this once, after a 202. Both halves matter: the storage write is
    // what stops an abandoned registration outliving the flow, and the re-render is
    // what a bare sessionStorage.removeItem at the call site would not have done.
    const user = userEvent.setup();
    await renderSetup(<DraftClearer />);

    await user.click(screen.getByRole('button', { name: 'fill' }));
    expect(screen.getByText('2,000 / Marko')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'clear' }));

    expect(sessionStorage.getItem(SETUP_DRAFT_KEY)).toBeNull();
    expect(screen.getByText('/')).toBeInTheDocument();
  });

  it('leaves a later patch starting from empty rather than from a stale snapshot', async () => {
    // The cache-invalidation half, and the reason clearDraft cannot live outside the
    // provider. Clear the key without updating `cache.current` and getSnapshot keeps
    // answering the old JSON, so this patch would merge onto the cleared budget and
    // bring it back.
    const user = userEvent.setup();
    await renderSetup(<DraftClearer />);

    await user.click(screen.getByRole('button', { name: 'fill' }));
    await user.click(screen.getByRole('button', { name: 'clear' }));
    await user.click(screen.getByRole('button', { name: 'set name' }));

    expect(screen.getByText('/ Marko')).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(SETUP_DRAFT_KEY)!).budget).toBe('');
  });

  it('is safe on an already-empty slot', async () => {
    const user = userEvent.setup();
    await renderSetup(<DraftClearer />);

    await user.click(screen.getByRole('button', { name: 'clear' }));

    expect(sessionStorage.getItem(SETUP_DRAFT_KEY)).toBeNull();
  });
});

describe('useSetupDraft', () => {
  it('throws outside a provider rather than defaulting', () => {
    // A silent empty-draft fallback would let a step render perfectly while
    // quietly failing AC5. Same call matchItem() makes by returning undefined.
    //
    // React logs the error it re-throws, so the console is silenced for this one
    // assertion rather than left to look like a real failure in the output.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<DraftProbe />)).toThrow(/SetupDraftProvider/);

    consoleError.mockRestore();
  });
});
