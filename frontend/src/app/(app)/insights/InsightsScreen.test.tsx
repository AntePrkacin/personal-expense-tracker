import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { generateInsights } from '../../../lib/generateInsights';
import type { InsightSet } from '../../../lib/insights';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { InsightsScreen } from './InsightsScreen';
import { INSIGHTS_EMPTY_COPY } from './InsightsEmpty';

// The three states, the tone mapping and the poll.
//
// A relative specifier, because `jest.mock` cannot resolve the `@/` alias anywhere in this repo
// - see the note in `frontend/src/app/CLAUDE.md`.
jest.mock('../../../lib/generateInsights', () => ({ generateInsights: jest.fn() }));

// The empty state renders `AddTransactionButton`, and the modal its provider mounts reaches
// `useRouter` for its refresh. The screen itself reaches it too, for the dead-session branch
// below, which is why `refresh` is one shared mock rather than a fresh one per call.
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, replace: jest.fn(), push: jest.fn() }),
}));

const generate = generateInsights as jest.Mock;

const CARDS = [
  { tone: 'warning', title: 'Dining out is over budget', body: '$312 of $300 - $12 over' },
  { tone: 'positive', title: 'Transport is down 22%', body: 'You spent $63 less than September' },
] satisfies InsightSet['insights'];

const readySet = (overrides: Partial<InsightSet> = {}): InsightSet => ({
  state: 'ready',
  monthLabel: 'October 2025',
  summary: {
    headline: "You're on track this month",
    body: "You've spent $1,240 of your $2,000 budget with 8 days to go.",
  },
  insights: CARDS,
  generatedAt: '2025-10-08T09:00:00.000Z',
  ...overrides,
});

const emptySet = (): InsightSet => ({
  state: 'empty',
  monthLabel: null,
  summary: null,
  insights: [],
  generatedAt: null,
});

/** The provider is required: the empty state's button calls `useAddTransaction`. */
const renderScreen = (set: InsightSet) =>
  render(
    <AddTransactionProvider>
      <InsightsScreen set={set} overline="October 2025" />
    </AddTransactionProvider>,
  );

/** Re-renders with a new server read, the way `router.refresh()` does. */
const rerenderScreen = (rerender: ReturnType<typeof renderScreen>['rerender'], set: InsightSet) =>
  rerender(
    <AddTransactionProvider>
      <InsightsScreen set={set} overline="October 2025" />
    </AddTransactionProvider>,
  );

/** One poll response. */
const respondWith = (set: InsightSet) =>
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => set,
  });

beforeEach(() => {
  jest.clearAllMocks();
  generate.mockResolvedValue({ ok: true });
  global.fetch = jest.fn();
});

describe('the ready state', () => {
  it('renders the banner and both cards from the set, owning none of the copy', () => {
    renderScreen(readySet());

    expect(screen.getByText('October 2025 summary')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "You're on track this month" })).toBeInTheDocument();
    expect(screen.getByText(/You've spent \$1,240/)).toBeInTheDocument();

    for (const card of CARDS) {
      expect(screen.getByText(card.title)).toBeInTheDocument();
      expect(screen.getByText(card.body)).toBeInTheDocument();
    }
  });

  it('names each tone in text, so the colour is not the only carrier', () => {
    // Asserted by semantics rather than by class strings, which is this repo's rule. The tone
    // reaches the screen as a hue on one glyph and nothing else, which is the colour-alone
    // failure PET-22's trend chart already paid for.
    renderScreen(readySet());

    expect(
      screen.getByRole('heading', { name: 'Warning: Dining out is over budget' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Good news: Transport is down 22%' }),
    ).toBeInTheDocument();
  });

  it('renders a one-card set', () => {
    renderScreen(readySet({ insights: [CARDS[0]] }));

    expect(screen.getByText(CARDS[0].title)).toBeInTheDocument();
    expect(screen.queryByText(CARDS[1].title)).not.toBeInTheDocument();
  });

  it('renders the banner alone for a zero-card set, with no grid element at all', () => {
    // The steady state rather than an edge case since PET-42-43-44: over-cap needs a category
    // past its cap and month-over-month needs a previous month, so a first-month user who set
    // no caps sees exactly this. An empty grid would leave a gap of dead space below the banner.
    const { container } = renderScreen(readySet({ insights: [] }));

    expect(screen.getByRole('heading', { name: "You're on track this month" })).toBeInTheDocument();
    expect(container.querySelector('.grid')).toBeNull();
  });

  it('falls back rather than rendering nothing for a tone stored before the cut', () => {
    // `insights.tone` is a plain text column with no CHECK constraint, so a set generated
    // before `info` was retired still holds one. The card has to render, and it has to carry a
    // tone name in text like every other - the fallback is the neutral treatment, so it reads
    // as ordinary older content rather than as an error.
    renderScreen(
      readySet({
        insights: [
          { tone: 'info', title: 'On pace for $1,980', body: 'Just under your target' },
        ] as unknown as InsightSet['insights'],
      }),
    );

    expect(
      screen.getByRole('heading', { name: 'Worth a look: On pace for $1,980' }),
    ).toBeInTheDocument();
  });
});

describe('the empty state', () => {
  it('renders its designed copy and offers the Add transaction trigger', async () => {
    const user = userEvent.setup();
    renderScreen(emptySet());

    expect(screen.getByRole('heading', { name: INSIGHTS_EMPTY_COPY.heading })).toBeInTheDocument();
    expect(screen.getByText(INSIGHTS_EMPTY_COPY.body)).toBeInTheDocument();

    // The two lines PET-31 predicted this card would cost: the modal is mounted once on the
    // shell, so the trigger is the component and nothing else.
    await user.click(screen.getByRole('button', { name: INSIGHTS_EMPTY_COPY.action }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('still offers Regenerate, because this state is reachable with a set to generate', () => {
    // Amends INS-1, which draws no header control on frame 16. The premise that `empty` means
    // "never logged a transaction" fails for an account whose transactions predate the
    // write-path trigger and for one whose first run failed - and hiding the button made both
    // a dead end with nothing on screen that could generate anything.
    renderScreen(emptySet());

    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  });
});

describe('mounting', () => {
  // The regression test for the trigger this branch deliberately removed. PET-44's plan had the
  // empty state POST on mount, which made a read-only screen write on every visit and made
  // React Strict Mode's dev double-mount 409 against itself. The write path owns it now.
  it.each([
    ['empty', emptySet()],
    ['ready', readySet()],
  ])('generates nothing on mount in the %s state', (_name, set) => {
    renderScreen(set);

    expect(generate).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('the generating state and the poll', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  /** Lets the poll's timer fire and its promise chain settle. */
  const advance = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  };

  it('shows skeletons with no click when the page mounts already generating', () => {
    renderScreen(readySet({ state: 'generating' }));

    expect(screen.getByText('Analyzing your spending...')).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
  });

  it('draws as many skeleton cards as the last-good set had, and none when it had none', () => {
    const { container, rerender } = renderScreen(readySet({ state: 'generating' }));
    expect(container.querySelectorAll('.skeleton.size-9')).toHaveLength(2);

    rerenderScreen(rerender, readySet({ state: 'generating', insights: [], generatedAt: null }));
    expect(container.querySelectorAll('.skeleton.size-9')).toHaveLength(0);
  });

  it('disables the button and relabels it while generating', () => {
    renderScreen(readySet({ state: 'generating' }));

    const button = screen.getByRole('button', { name: 'Generating...' });
    expect(button).toBeDisabled();
  });

  it('switches to skeletons when Regenerate is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderScreen(readySet());

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));

    expect(generate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Analyzing your spending...')).toBeInTheDocument());
  });

  it('enters polling on a 409, because a run already in flight is what the click asked for', async () => {
    // `generateInsights` reports a 409 as `ok`, so this is the same path a fresh 202 takes -
    // which is the point: the page's next move is identical either way, and an error message
    // over a page about to show fresh content would be wrong.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    generate.mockResolvedValue({ ok: true });
    respondWith(readySet({ state: 'generating' }));
    renderScreen(readySet());

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    await waitFor(() => expect(screen.getByText('Analyzing your spending...')).toBeInTheDocument());

    await advance(500);
    expect(global.fetch).toHaveBeenCalledWith('/api/insights', { cache: 'no-store' });
  });

  it('leaves the previous set on screen and re-enables the button when the run failed', async () => {
    // A26 designs no error surface: a failed run is invisible by contract. `state` never moved,
    // so the previous set is still what is rendered and the button is still enabled - both
    // because they are derived from `state` rather than from a click flag.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    generate.mockResolvedValue({ ok: false, reason: 'failed' });
    renderScreen(readySet());

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));

    await waitFor(() => expect(generate).toHaveBeenCalled());
    expect(screen.getByText(CARDS[0].title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  });

  it('swaps in the new set and stops polling once the state settles', async () => {
    respondWith(readySet({ insights: [CARDS[0]], generatedAt: '2025-10-08T10:00:00.000Z' }));
    renderScreen(readySet({ state: 'generating' }));

    await advance(500);

    expect(screen.getByText(CARDS[0].title)).toBeInTheDocument();
    expect(screen.queryByText('Analyzing your spending...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();

    // Settled, so no further tick is scheduled.
    const callsAfterSettling = (global.fetch as jest.Mock).mock.calls.length;
    await advance(30_000);
    expect(global.fetch).toHaveBeenCalledTimes(callsAfterSettling);
  });

  it('leaves the previous set on screen when the run finished without a new one', async () => {
    // A run that failed is invisible by contract (AC6): its row is marked `failed` and skipped,
    // so the read settles back to the previous `ready` set with `generatedAt` unmoved. The page
    // shows that content and re-enables the button, with no error state anywhere - which is
    // what makes A26's undesigned failure survivable. `generatedAt` is written at exactly one
    // place, inside the transition to `ready`, so it advances only when a run really completed.
    const previous = readySet();
    respondWith(previous);
    renderScreen(readySet({ state: 'generating' }));

    await advance(500);

    expect(screen.getByText(CARDS[0].title)).toBeInTheDocument();
    expect(screen.getByText(CARDS[1].title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  });

  it('keeps polling with a backoff while the state holds', async () => {
    respondWith(readySet({ state: 'generating' }));
    renderScreen(readySet({ state: 'generating' }));

    await advance(500);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // The second delay is 1000, not another 500.
    await advance(500);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await advance(500);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('stops polling on unmount, so navigating away leaves no timer running', async () => {
    respondWith(readySet({ state: 'generating' }));
    const { unmount } = renderScreen(readySet({ state: 'generating' }));

    await advance(500);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    unmount();
    await advance(60_000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  /** Past `POLL_CEILING_MS`, one backoff step at a time. */
  const advancePastCeiling = async () => {
    // A single large advance cannot chain the poll: each tick schedules its successor from
    // inside an awaited continuation, so the timer only exists once microtasks have run.
    for (let step = 0; step < 80; step++) {
      await advance(5_000);
    }
  };

  it('falls back to the last-good set and re-enables the button when the poll gives up', async () => {
    // Stopping the timer was all the ceiling used to do, which left `state` on `generating`
    // with the effect's only dependency unable to change again - permanent skeletons under a
    // disabled "Generating...", recoverable only by a reload. A backend unreachable for the
    // whole 5.5 minutes is the reachable way in, so every tick throws here.
    (global.fetch as jest.Mock).mockRejectedValue(new Error('unreachable'));
    renderScreen(readySet({ state: 'generating' }));

    expect(screen.getByText('Analyzing your spending...')).toBeInTheDocument();

    await advancePastCeiling();

    expect(screen.queryByText('Analyzing your spending...')).not.toBeInTheDocument();
    expect(screen.getByText(CARDS[0].title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();

    // And it really stopped asking, rather than merely rendering as though it had.
    const calls = (global.fetch as jest.Mock).mock.calls.length;
    await advance(60_000);
    expect(global.fetch).toHaveBeenCalledTimes(calls);
  });

  it('falls back to the empty card when the run it gave up on had no content behind it', async () => {
    // The other arm: the read carries content independently of `state`, and a first run has
    // none to fall back to. The empty card plus the header's Regenerate is the honest pair -
    // skeletons would keep asserting a run this screen has no way left to ask about.
    (global.fetch as jest.Mock).mockRejectedValue(new Error('unreachable'));
    renderScreen({ ...emptySet(), state: 'generating' });

    await advancePastCeiling();

    expect(screen.getByRole('heading', { name: INSIGHTS_EMPTY_COPY.heading })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  });

  it('re-enters polling when Regenerate is clicked after the poll gave up', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    (global.fetch as jest.Mock).mockRejectedValue(new Error('unreachable'));
    renderScreen(readySet({ state: 'generating' }));

    await advancePastCeiling();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));

    // `state` never moved off `generating`, so this only works because the click clears the
    // giving-up flag as well as setting the state.
    await waitFor(() => expect(screen.getByText('Analyzing your spending...')).toBeInTheDocument());
  });

  it('refreshes the route when the session died, rather than doing nothing at all', async () => {
    // A26 designs no error surface for a failed *run*, and this is not that: a 401 means
    // nothing on the page will work again, and without this branch the click was silent and
    // stayed silent on every subsequent press. The redirect belongs to the server, so
    // re-running the Server Component puts `requireInsights()` in front of the dead cookie.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    generate.mockResolvedValue({ ok: false, reason: 'unauthenticated' });
    renderScreen(readySet());

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(screen.queryByText('Analyzing your spending...')).not.toBeInTheDocument();
  });

  it('starts polling when the state prop changes, with no click anywhere', async () => {
    // The `router.refresh()` path a save takes, and the only one of the three ways into the
    // generating state that no other case here covers. A user on the empty state clicks "Add
    // your first transaction", saves, and the modal refreshes the route - which re-runs the
    // Server Component and hands this screen `state: 'generating'`. Without adopting the
    // changed prop the page renders skeletons with no timer and stays there until a reload.
    respondWith(readySet({ generatedAt: '2025-10-08T11:00:00.000Z' }));
    const { rerender } = renderScreen(emptySet());

    expect(global.fetch).not.toHaveBeenCalled();

    rerenderScreen(rerender, {
      ...emptySet(),
      state: 'generating',
    });

    expect(screen.getByText('Analyzing your spending...')).toBeInTheDocument();

    await advance(500);
    expect(global.fetch).toHaveBeenCalledWith('/api/insights', { cache: 'no-store' });
    expect(screen.getByText(CARDS[0].title)).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
  });
});
