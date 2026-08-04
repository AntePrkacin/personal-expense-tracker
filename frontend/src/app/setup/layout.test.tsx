import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SETUP_DRAFT_KEY } from './draft';
import { useSetupDraft } from './SetupDraftProvider';
import SetupLayout from './layout';

// The setup layout is one line long, and that line fails in a way no other test
// in this suite would notice: delete the provider and every step still renders
// its own markup, then throws the moment a field is touched. Same reasoning
// `(app)/layout.test.tsx` records for its own three lines.

/** Reads the draft the way a real step does, so the wiring is what is under test. */
function DraftProbe() {
  const { draft } = useSetupDraft();
  return <p>currency: {draft.currency}</p>;
}

describe('SetupLayout', () => {
  it('provides the draft to its children', () => {
    // The whole point. Remove SetupDraftProvider from layout.tsx and this throws
    // "useSetupDraft must be used inside a SetupDraftProvider", which is the loud
    // failure the hook's own error message exists to give.
    render(
      <SetupLayout>
        <DraftProbe />
      </SetupLayout>,
    );

    expect(screen.getByText('currency: USD')).toBeInTheDocument();
  });

  it('renders its children', () => {
    render(
      <SetupLayout>
        <p>step content</p>
      </SetupLayout>,
    );

    expect(screen.getByText('step content')).toBeInTheDocument();
  });

  it('renders no chrome of its own', () => {
    // The logo, the step indicator and the card belong to SetupShell, which each
    // step renders with its own `step`. If they ever move here, the active dot
    // becomes unreachable: a layout cannot read the pathname on the server.
    const { container } = render(
      <SetupLayout>
        <p>step content</p>
      </SetupLayout>,
    );

    expect(screen.queryAllByRole('heading')).toHaveLength(0);
    expect(screen.queryByText('Spendifico')).not.toBeInTheDocument();
    // One child, the page. Nothing wrapping, nothing beside it.
    expect(container.innerHTML).toBe('<p>step content</p>');
  });

  it('sets no segment config, so /setup can prerender static', () => {
    // The inverse of (app)/layout.tsx's assertion. Nothing in this segment reads
    // a request, so `force-dynamic` here would be a claim about nothing - and
    // copying it across from the shell is the obvious reflex mistake.
    const segment: Record<string, unknown> = jest.requireActual('./layout');
    expect(segment.dynamic).toBeUndefined();
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
    render(
      <SetupLayout>
        <DraftEditor />
      </SetupLayout>,
    );

    await user.click(screen.getByRole('button', { name: 'set budget' }));
    expect(screen.getByText('USD / 2,000')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'set currency' }));

    expect(screen.getByText('EUR / 2,000')).toBeInTheDocument();
  });

  it('persists the merged draft, not just the patch', async () => {
    const user = userEvent.setup();
    render(
      <SetupLayout>
        <DraftEditor />
      </SetupLayout>,
    );

    await user.click(screen.getByRole('button', { name: 'set budget' }));
    await user.click(screen.getByRole('button', { name: 'set currency' }));

    expect(JSON.parse(sessionStorage.getItem(SETUP_DRAFT_KEY)!)).toEqual({
      currency: 'EUR',
      budget: '2,000',
    });
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
