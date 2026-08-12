import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// `render` comes from the shell wrapper: the Add transaction modal the empty state can open
// prefixes the profile's currency symbol as of PET-47, so it reaches `useMoney()`/`useCurrency()`.
// See `shellRender.tsx`.
import { render } from '../shellRender';

import { generateInsights } from '../../../lib/generateInsights';
import type { InsightSet } from '../../../lib/insights';

import { toastMessages } from '../toastQueries';
import { AddTransactionProvider } from '../AddTransactionProvider';
import { InsightCardsSlot } from './InsightCardsSlot';
import { InsightPollProvider } from './InsightPoll';
import { InsightSummarySlot } from './InsightSummarySlot';
import { PENDING_COPY, UNLOCK_COPY } from './SummaryBanner';

// The four states, the tone mapping, the poll and the period guard.
//
// **This file is `insights/InsightsScreen.test.tsx` moved rather than rewritten**, which PET-73's
// plan calls the most valuable artifact in the feature: the backoff timing, the ceiling, the
// unmount cancel, the prop-change path, the 409-as-success path, the retired-`info` fallback and
// the regression test that **nothing POSTs on mount in either state** all transfer unchanged in
// substance. What changed around them is the harness - two slots reading one provider instead of
// one screen owning the state - plus the `isCurrentPeriod` cases at the end, which are new.
//
// A relative specifier, because `jest.mock` cannot resolve the `@/` alias anywhere in this repo -
// see the note in `frontend/src/app/CLAUDE.md`.
jest.mock('../../../lib/generateInsights', () => ({ generateInsights: jest.fn() }));

// The unlock state renders `AddTransactionButton`, and the modal its provider mounts reaches
// `useRouter` for its refresh. The provider reaches it too, for the dead-session branch below,
// which is why `refresh` is one shared mock rather than a fresh one per call.
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

type Options = { isCurrentPeriod?: boolean; isEmpty?: boolean };

/**
 * Both consumers under one provider, which is the arrangement the Dashboard really has: the two
 * sit in different grid columns with a Server Component between them, and the whole reason
 * `InsightPoll` is a provider is that one timer serves both.
 *
 * The `AddTransactionProvider` is required, because the unlock state's button calls
 * `useAddTransaction`.
 */
const tree = (set: InsightSet, { isCurrentPeriod = true, isEmpty = false }: Options = {}) => (
  <AddTransactionProvider>
    <InsightPollProvider set={set} isCurrentPeriod={isCurrentPeriod} isEmpty={isEmpty}>
      <InsightSummarySlot />
      <InsightCardsSlot />
    </InsightPollProvider>
  </AddTransactionProvider>
);

const renderPoll = (set: InsightSet, options?: Options) => render(tree(set, options));

/** Re-renders with a new server read, the way `router.refresh()` does. */
const rerenderPoll = (
  rerender: ReturnType<typeof renderPoll>['rerender'],
  set: InsightSet,
  options?: Options,
) => rerender(tree(set, options));

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
    renderPoll(readySet());

    expect(screen.getByRole('heading', { name: "You're on track this month" })).toBeInTheDocument();
    expect(screen.getByText(/You've spent \$1,240/)).toBeInTheDocument();

    // **The period is deliberately not on this card, as of PET-78.** It read
    // "OCTOBER 2025 SUMMARY" above the headline while the page header's overline and the period
    // select both already said the period - three statements of one fact on one screen. Asserted
    // as an absence so it cannot come back unnoticed; `SummaryBanner.tsx` records what the
    // deletion gives up, which is that a set can outlive the period it describes.
    expect(screen.queryByText(/summary/i)).not.toBeInTheDocument();
    expect(screen.queryByText('October 2025')).not.toBeInTheDocument();

    for (const card of CARDS) {
      expect(screen.getByText(card.title)).toBeInTheDocument();
      expect(screen.getByText(card.body)).toBeInTheDocument();
    }
  });

  it('offers the chat rather than a page of cards, which is what the label change says', () => {
    // The destination is a conversation now: the cards it used to link to are on this screen.
    renderPoll(readySet());

    expect(
      screen.getByRole('link', { name: /Ask AI Assistant about your spending/ }),
    ).toHaveAttribute('href', '/insights');
  });

  it('names each tone in text, so the colour is not the only carrier', () => {
    // Asserted by semantics rather than by class strings, which is this repo's rule. The tone
    // reaches the screen as a hue on one glyph and nothing else, which is the colour-alone
    // failure PET-22's trend chart already paid for.
    renderPoll(readySet());

    expect(
      screen.getByRole('heading', { name: 'Warning: Dining out is over budget' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Good news: Transport is down 22%' }),
    ).toBeInTheDocument();
  });

  it('renders a one-card set', () => {
    renderPoll(readySet({ insights: [CARDS[0]] }));

    expect(screen.getByText(CARDS[0].title)).toBeInTheDocument();
    expect(screen.queryByText(CARDS[1].title)).not.toBeInTheDocument();
  });

  it('renders the banner alone for a zero-card set, with no card element at all', () => {
    // The steady state rather than an edge case since PET-42-43-44: over-cap needs a category
    // past its cap and month-over-month needs a previous period, so a first-period user who set
    // no caps sees exactly this. The cards slot renders nothing at all rather than an empty
    // container, which would leave a `gap-5` of dead space under the donut.
    const { container } = renderPoll(readySet({ insights: [] }));

    expect(screen.getByRole('heading', { name: "You're on track this month" })).toBeInTheDocument();
    expect(container.querySelectorAll('.size-9')).toHaveLength(0);
  });

  it('falls back rather than rendering nothing for a tone stored before the cut', () => {
    // `insights.tone` is a plain text column with no CHECK constraint, so a set generated before
    // `info` was retired still holds one. The card has to render, and it has to carry a tone name
    // in text like every other - the fallback is the neutral treatment, so it reads as ordinary
    // older content rather than as an error.
    renderPoll(
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
  it('draws the unlock copy and the Add transaction trigger for an account with nothing logged', async () => {
    const user = userEvent.setup();
    renderPoll(emptySet(), { isEmpty: true });

    expect(screen.getByRole('heading', { name: UNLOCK_COPY.headline })).toBeInTheDocument();
    expect(screen.getByText(UNLOCK_COPY.body)).toBeInTheDocument();

    // The two lines PET-31 predicted this card would cost: the modal is mounted once on the
    // shell, so the trigger is the component and nothing else.
    await user.click(screen.getByRole('button', { name: 'Add transaction →' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('draws the pending copy for an account that has spent but has no set', () => {
    // The honest third state: telling somebody with two hundred expenses that insights unlock
    // after their first is the failure this split exists for.
    renderPoll(emptySet(), { isEmpty: false });

    expect(screen.getByRole('heading', { name: PENDING_COPY.headline })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add transaction →' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Ask AI Assistant about your spending/ }),
    ).toBeInTheDocument();
  });

  it('still offers Regenerate, because this state is reachable with a set to generate', () => {
    // Amends INS-1, which draws no control on frame 16. The premise that `empty` means "never
    // logged a transaction" fails for an account whose transactions predate the write-path
    // trigger and for one whose first run failed - and hiding the button made both a dead end
    // with nothing on screen that could generate anything.
    //
    // **The fixture is `isEmpty: false`, and it used to be `true`, which contradicted the comment
    // above it.** Both states this test names have transactions in them; `isEmpty: true` is the
    // account with none, where a run can only produce the empty set it already has. PET-78 made
    // the button conditional and that disagreement became a real one - the case below pins the
    // unlock state having no Regenerate at all.
    renderPoll(emptySet(), { isEmpty: false });

    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  });

  it('offers no Regenerate in the unlock state, where a run has nothing to analyse', () => {
    // PET-78. An account with nothing logged has one thing to do and it is not regenerating: the
    // generator would answer with the same empty set. `AddTransactionButton` is the whole control.
    renderPoll(emptySet(), { isEmpty: true });

    expect(screen.getByRole('button', { name: 'Add transaction →' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate' })).not.toBeInTheDocument();
  });

  it('renders no insight cards', () => {
    const { container } = renderPoll(emptySet(), { isEmpty: true });

    expect(container.querySelectorAll('.size-9')).toHaveLength(0);
  });
});

describe('a period navigated back to', () => {
  // **The interaction PET-72 created and the piece most likely to be got wrong**, because it is
  // invisible until somebody navigates: nothing fails without the guard, the Dashboard simply
  // shows October's analysis over September's figures on a screen where every other figure is
  // correct. Insights are generated for the current period only and `GET /api/insights` publishes
  // no period at all, so there is nothing honest to put here.
  it('renders neither the banner nor the cards', () => {
    renderPoll(readySet(), { isCurrentPeriod: false });

    expect(screen.queryByText('October 2025 summary')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: "You're on track this month" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(CARDS[0].title)).not.toBeInTheDocument();
  });

  it('offers no Regenerate either, so nothing on it can write', () => {
    renderPoll(readySet(), { isCurrentPeriod: false });

    expect(screen.queryByRole('button', { name: 'Regenerate' })).not.toBeInTheDocument();
  });

  it('renders nothing in the unlock state either, rather than standing in for it', () => {
    renderPoll(emptySet(), { isCurrentPeriod: false, isEmpty: true });

    expect(screen.queryByRole('heading', { name: UNLOCK_COPY.headline })).not.toBeInTheDocument();
  });

  it('starts no poll, so a past period costs no requests', async () => {
    renderPoll(readySet({ state: 'generating' }), { isCurrentPeriod: false });

    await act(async () => {
      await Promise.resolve();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('mounting', () => {
  // The regression test for the trigger PET-42-43-44 deliberately removed. PET-44's plan had the
  // empty state POST on mount, which made a read-only screen write on every visit and made React
  // Strict Mode's dev double-mount 409 against itself. The write path owns it now.
  it.each([
    ['empty', emptySet()],
    ['ready', readySet()],
  ])('generates nothing on mount in the %s state', (_name, set) => {
    renderPoll(set);

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
    renderPoll(readySet({ state: 'generating' }));

    expect(screen.getByText('Analyzing your spending...')).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
  });

  it('draws as many skeleton cards as the last-good set had, and none when it had none', () => {
    const { container, rerender } = renderPoll(readySet({ state: 'generating' }));
    expect(container.querySelectorAll('.skeleton.size-9')).toHaveLength(2);

    rerenderPoll(rerender, readySet({ state: 'generating', insights: [], generatedAt: null }));
    expect(container.querySelectorAll('.skeleton.size-9')).toHaveLength(0);
  });

  it('offers no control at all while the skeletons are up', () => {
    // The banner is the skeleton in this state, so there is nothing to put a button on - which
    // is the row of the copy table that reads "none while the skeletons are up".
    renderPoll(readySet({ state: 'generating' }));

    expect(screen.queryByRole('button', { name: 'Regenerate' })).not.toBeInTheDocument();
  });

  // **These click from the pending state rather than from `ready`, and that is PET-78 rather than
  // a preference.** Regenerate is no longer drawn in the `ready` state, because the set regenerates
  // itself on every transaction and category write - so a click from a healthy account is not a
  // path a user can take any more, and a test taking it would be testing an unreachable control.
  // The pending state is where the button really lives, and the machinery behind the click is
  // state-independent, so what these cases cover is unchanged.
  const pending = () => renderPoll(emptySet(), { isEmpty: false });

  it('switches to skeletons when Regenerate is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    pending();

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));

    expect(generate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Analyzing your spending...')).toBeInTheDocument());
  });

  it('enters polling on a 409, because a run already in flight is what the click asked for', async () => {
    // `generateInsights` reports a 409 as `ok`, so this is the same path a fresh 202 takes -
    // which is the point: the screen's next move is identical either way, and an error message
    // over a card about to show fresh content would be wrong.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    generate.mockResolvedValue({ ok: true });
    respondWith(readySet({ state: 'generating' }));
    pending();

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    await waitFor(() => expect(screen.getByText('Analyzing your spending...')).toBeInTheDocument());

    await advance(500);
    expect(global.fetch).toHaveBeenCalledWith('/api/insights', { cache: 'no-store' });
  });

  it('leaves the card as it was and re-enables the button when the run failed', async () => {
    // A26 designs no error surface: a failed run is invisible by contract. `state` never moved, so
    // what was on screen is still what is rendered and the button is still enabled - both because
    // they are derived from `state` rather than from a click flag.
    //
    // **It asserts the pending copy rather than the previous set's cards, because PET-78 made the
    // ready-state click unreachable.** The subject is unchanged - a failed run changes nothing and
    // leaves the control usable - and this is the state a user can really press it from, so the
    // "previous content" it must not disturb is that state's own copy.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    generate.mockResolvedValue({ ok: false, reason: 'failed' });
    pending();

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));

    await waitFor(() => expect(generate).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: PENDING_COPY.headline })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
    // **The one thing that did change (PET-77).** This arm used to be silent in every sense: the
    // click did nothing observable at all, so a user could press it repeatedly with no way of
    // knowing. The screen is still unchanged - A26 makes a failed *run* invisible - and the toast
    // is what says the request itself did not land.
    await waitFor(() =>
      expect(toastMessages()).toEqual(["We couldn't update your insights. Please try again."]),
    );
  });

  // **A run the user asked for is announced; the ones that fire behind every write are not.** That
  // split is the ticket's, and it is what keeps a saved transaction from producing two toasts.
  it('confirms a manual run when it settles', async () => {
    // PET-77's toast, pressed from the state PET-78 leaves the button in. The confirmation is not
    // reachable from `ready` any more, because that is where the control is now hidden - which
    // narrows where "Insights updated." can appear without making it dead: a manual run is exactly
    // a run started from pending or after a stall.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    generate.mockResolvedValue({ ok: true });
    respondWith(readySet({ insights: [CARDS[0]], generatedAt: '2025-10-08T10:00:00.000Z' }));
    pending();

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    await advance(500);

    await waitFor(() => expect(toastMessages()).toEqual(['Insights updated.']));
  });

  // **The stuck-flag case a review found.** `generating` can go false without the poll settling -
  // a `router.refresh()` delivering an already-`ready` set, or a period navigation - and the flag
  // used to survive that, so the *next* background regeneration announced itself as the user's.
  it('forgets a manual run that was abandoned before it settled', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    generate.mockResolvedValue({ ok: true });
    // Pending rather than ready, for the reason the case above gives: only the initial render needs
    // the button, and PET-78 draws it there rather than on a healthy account.
    const { rerender } = renderPoll(emptySet(), { isEmpty: false });

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    await waitFor(() => expect(screen.getByText('Analyzing your spending...')).toBeInTheDocument());

    // The server hands back a settled set on its own, which takes the poll down without it ever
    // observing a settle of its own.
    rerenderPoll(rerender, readySet({ generatedAt: '2025-10-08T10:00:00.000Z' }));

    // A later run nobody pressed for must stay silent.
    respondWith(readySet({ insights: [CARDS[0]], generatedAt: '2025-10-08T11:00:00.000Z' }));
    rerenderPoll(rerender, readySet({ state: 'generating' }));
    await advance(500);

    expect(toastMessages()).toEqual([]);
  });

  it('says nothing when a run nobody pressed for settles', async () => {
    // The write path regenerates the set backend-side, so this is what the tail of an ordinary save
    // looks like from here: the screen arrives already generating and settles on its own.
    respondWith(readySet({ insights: [CARDS[0]], generatedAt: '2025-10-08T10:00:00.000Z' }));
    renderPoll(readySet({ state: 'generating' }));

    await advance(500);

    expect(screen.getByText(CARDS[0].title)).toBeInTheDocument();
    expect(toastMessages()).toEqual([]);
  });

  it('swaps in the new set and stops polling once the state settles', async () => {
    respondWith(readySet({ insights: [CARDS[0]], generatedAt: '2025-10-08T10:00:00.000Z' }));
    renderPoll(readySet({ state: 'generating' }));

    await advance(500);

    expect(screen.getByText(CARDS[0].title)).toBeInTheDocument();
    expect(screen.queryByText('Analyzing your spending...')).not.toBeInTheDocument();
    // **The settled state now has no Regenerate**, which is PET-78: a healthy `ready` account gets
    // the assistant link alone, because every transaction and category write regenerates the set by
    // itself. This assertion used to read `toBeEnabled()` and was standing in for "the run is over";
    // the skeleton's absence above is the direct statement of that, so this pins the new rule
    // instead of re-stating the old proxy.
    expect(screen.queryByRole('button', { name: 'Regenerate' })).not.toBeInTheDocument();

    // Settled, so no further tick is scheduled.
    const callsAfterSettling = (global.fetch as jest.Mock).mock.calls.length;
    await advance(30_000);
    expect(global.fetch).toHaveBeenCalledTimes(callsAfterSettling);
  });

  it('leaves the previous set on screen when the run finished without a new one', async () => {
    // A run that failed is invisible by contract (AC6): its row is marked `failed` and skipped,
    // so the read settles back to the previous `ready` set with `generatedAt` unmoved. The screen
    // shows that content, with no error state anywhere - which is what makes A26's undesigned
    // failure survivable. `generatedAt` is written at exactly one place, inside the transition to
    // `ready`, so it advances only when a run really completed.
    //
    // **This case used to assert no Regenerate, and that was the defect rather than the rule.** A
    // review of PR #92 found it: `displayState` is `ready` here, so PET-78's condition drew no
    // control at all, and the account was left on prose that predates the write which triggered
    // this very run with nothing on screen able to start another. It is `runFailed` now, which is
    // exactly what an unmoved `generatedAt` across a settle means. Worth keeping as a correction,
    // because a suite pinning the wrong behaviour is why no gate caught it.
    const previous = readySet();
    respondWith(previous);
    renderPoll(readySet({ state: 'generating' }));

    await advance(500);

    expect(screen.getByText(CARDS[0].title)).toBeInTheDocument();
    expect(screen.getByText(CARDS[1].title)).toBeInTheDocument();
    expect(screen.queryByText('Analyzing your spending...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  });

  it('offers no Regenerate when a run that produced nothing was on an empty account', async () => {
    // The other half of the same review: the account has nothing to analyse, so a further run would
    // produce the same nothing and the one control that helps is "Add transaction". `runFailed` is
    // set here just as it is above - the gate that suppresses the button is `isEmpty`, which now
    // leads the condition rather than qualifying one of its terms.
    respondWith({ ...emptySet(), state: 'empty' });
    renderPoll({ ...emptySet(), state: 'generating' }, { isEmpty: true });

    await advance(500);

    expect(screen.getByRole('heading', { name: UNLOCK_COPY.headline })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate' })).not.toBeInTheDocument();
  });

  it('reports a manual run that settled on the set it started from as a failure', async () => {
    // **"Insights updated." was posted regardless until a review of PR #92 made the distinction
    // computable.** A run that settles with `generatedAt` unmoved changed nothing, so the success
    // toast confirmed an update that did not happen - on the one press where the user is watching
    // for precisely that. Same string the never-landed request uses, for the same reason: what was
    // asked for did not happen and pressing again is the thing to do about it.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    generate.mockResolvedValue({ ok: true });
    const previous = readySet();
    respondWith(previous);
    renderPoll({ ...previous, state: 'empty', summary: null, insights: [] }, { isEmpty: false });

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    await advance(500);

    await waitFor(() =>
      expect(toastMessages()).toEqual(["We couldn't update your insights. Please try again."]),
    );
  });

  it('keeps polling with a backoff while the state holds', async () => {
    respondWith(readySet({ state: 'generating' }));
    renderPoll(readySet({ state: 'generating' }));

    await advance(500);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // The second delay is 1000, not another 500.
    await advance(500);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await advance(500);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('polls once for both consumers, never once each', async () => {
    // The whole reason this is a provider. Two timers on one screen double the requests and can
    // disagree about which set is current.
    respondWith(readySet({ state: 'generating' }));
    renderPoll(readySet({ state: 'generating' }));

    await advance(500);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('stops polling on unmount, so navigating away leaves no timer running', async () => {
    respondWith(readySet({ state: 'generating' }));
    const { unmount } = renderPoll(readySet({ state: 'generating' }));

    await advance(500);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    unmount();
    await advance(60_000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  /** Past `POLL_CEILING_MS`, one backoff step at a time. */
  const advancePastCeiling = async () => {
    // A single large advance cannot chain the poll: each tick schedules its successor from inside
    // an awaited continuation, so the timer only exists once microtasks have run.
    for (let step = 0; step < 80; step++) {
      await advance(5_000);
    }
  };

  it('falls back to the last-good set and re-enables the button when the poll gives up', async () => {
    // Stopping the timer was all the ceiling used to do, which left `state` on `generating` with
    // the effect's only dependency unable to change again - permanent skeletons, recoverable only
    // by a reload. A backend unreachable for the whole 5.5 minutes is the reachable way in, so
    // every tick throws here.
    (global.fetch as jest.Mock).mockRejectedValue(new Error('unreachable'));
    renderPoll(readySet({ state: 'generating' }));

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

  it('falls back to the empty copy when the run it gave up on had no content behind it', async () => {
    // The other arm: the read carries content independently of `state`, and a first run has none
    // to fall back to. The empty copy plus Regenerate is the honest pair - skeletons would keep
    // asserting a run this mount has no way left to ask about.
    //
    // **It runs on `isEmpty: false`, and it was `true` until a review of PR #92.** The account with
    // no content to fall back to and the account with nothing logged are two different accounts, and
    // this case is about the first: an account whose transactions predate the write-path trigger, or
    // whose first run failed. On `isEmpty: true` it was also asserting the pair the case below says
    // must not exist, which is how the contradiction shipped - two cases in one file, each green.
    (global.fetch as jest.Mock).mockRejectedValue(new Error('unreachable'));
    renderPoll({ ...emptySet(), state: 'generating' }, { isEmpty: false });

    await advancePastCeiling();

    expect(screen.getByRole('heading', { name: PENDING_COPY.headline })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  });

  it('offers no Regenerate when the run it gave up on was on an empty account', async () => {
    // **The contradiction the review found, pinned from the side that was wrong.** An account with
    // nothing logged has nothing to analyse, so the unlock copy's "Add transaction →" is the one
    // control that helps - and `InsightSummarySlot`'s condition excluded `isEmpty` on the `empty`
    // term only, so a stall walked straight past it and drew both buttons. This fails with the gate
    // written the old way, which is what it is here for.
    (global.fetch as jest.Mock).mockRejectedValue(new Error('unreachable'));
    renderPoll({ ...emptySet(), state: 'generating' }, { isEmpty: true });

    await advancePastCeiling();

    expect(screen.getByRole('heading', { name: UNLOCK_COPY.headline })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate' })).not.toBeInTheDocument();
  });

  it('re-enters polling when Regenerate is clicked after the poll gave up', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    (global.fetch as jest.Mock).mockRejectedValue(new Error('unreachable'));
    renderPoll(readySet({ state: 'generating' }));

    await advancePastCeiling();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));

    // `state` never moved off `generating`, so this only works because the click clears the
    // giving-up flag as well as setting the state.
    await waitFor(() => expect(screen.getByText('Analyzing your spending...')).toBeInTheDocument());
  });

  it('refreshes the route when the session died, rather than doing nothing at all', async () => {
    // A26 designs no error surface for a failed *run*, and this is not that: a 401 means nothing
    // on the page will work again, and without this branch the click was silent and stayed silent
    // on every subsequent press. The redirect belongs to the server, so re-running the Server
    // Component puts `requireInsights()` in front of the dead cookie.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    generate.mockResolvedValue({ ok: false, reason: 'unauthenticated' });
    pending();

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(screen.queryByText('Analyzing your spending...')).not.toBeInTheDocument();
  });

  it('starts polling when the state prop changes, with no click anywhere', async () => {
    // The `router.refresh()` path a save takes, and the only one of the three ways into the
    // generating state that no other case here covers. A user on the Dashboard's unlock copy
    // clicks "Add transaction", saves, and the modal refreshes the route - which re-runs the
    // Server Component and hands this provider `state: 'generating'`. Without adopting the
    // changed prop the cards render skeletons with no timer and stay there until a reload.
    respondWith(readySet({ generatedAt: '2025-10-08T11:00:00.000Z' }));
    const { rerender } = renderPoll(emptySet(), { isEmpty: true });

    expect(global.fetch).not.toHaveBeenCalled();

    rerenderPoll(rerender, { ...emptySet(), state: 'generating' }, { isEmpty: true });

    expect(screen.getByText('Analyzing your spending...')).toBeInTheDocument();

    await advance(500);
    expect(global.fetch).toHaveBeenCalledWith('/api/insights', { cache: 'no-store' });
    expect(screen.getByText(CARDS[0].title)).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
  });
});
