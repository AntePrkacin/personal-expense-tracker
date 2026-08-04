import { render, screen } from '@testing-library/react';

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
