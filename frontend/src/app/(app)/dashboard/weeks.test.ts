import { currentWeekIndex, todayFromDaysLeft } from './weeks';

// Four ordinary buckets tiling 1-28 October, the case a naive `startDate + 7 days` test would
// also pass - the short-final-bucket case below is the one that tells the two apart.
const FOUR_WEEKS = [
  { startDate: '2025-10-01', endDate: '2025-10-08', total: 280 },
  { startDate: '2025-10-08', endDate: '2025-10-15', total: 410 },
  { startDate: '2025-10-15', endDate: '2025-10-22', total: 250 },
  { startDate: '2025-10-22', endDate: '2025-10-29', total: 300 },
];

describe('currentWeekIndex', () => {
  it('finds today in the first bucket', () => {
    expect(currentWeekIndex(FOUR_WEEKS, '2025-10-01')).toBe(0);
    expect(currentWeekIndex(FOUR_WEEKS, '2025-10-07')).toBe(0);
  });

  it('finds today in a middle bucket', () => {
    expect(currentWeekIndex(FOUR_WEEKS, '2025-10-15')).toBe(2);
  });

  it('finds today in the last bucket, up to but excluding its endDate', () => {
    expect(currentWeekIndex(FOUR_WEEKS, '2025-10-22')).toBe(3);
    expect(currentWeekIndex(FOUR_WEEKS, '2025-10-28')).toBe(3);
  });

  it('returns null for a today on or after the final endDate', () => {
    expect(currentWeekIndex(FOUR_WEEKS, '2025-10-29')).toBeNull();
  });

  it('returns null for a today before the first startDate', () => {
    expect(currentWeekIndex(FOUR_WEEKS, '2025-09-30')).toBeNull();
  });

  it('returns null for an empty bucket list', () => {
    expect(currentWeekIndex([], '2025-10-08')).toBeNull();
  });

  describe('a short final bucket, the case a computed `startDate + 7 days` gets wrong', () => {
    // A 30-day period (monthStartDay produces one three weeks and a five-day tail) - the last
    // bucket ends at the period end rather than seven days after its own start, per the
    // contract. Writing the range test as `startDate + 7` would place every one of these last
    // five days outside every bucket and silently drop the highlight.
    const WITH_SHORT_TAIL = [
      { startDate: '2025-10-01', endDate: '2025-10-08', total: 280 },
      { startDate: '2025-10-08', endDate: '2025-10-15', total: 410 },
      { startDate: '2025-10-15', endDate: '2025-10-22', total: 250 },
      { startDate: '2025-10-22', endDate: '2025-10-29', total: 300 },
      { startDate: '2025-10-29', endDate: '2025-10-31', total: 90 },
    ];

    it('finds today on the first day of the short tail', () => {
      expect(currentWeekIndex(WITH_SHORT_TAIL, '2025-10-29')).toBe(4);
    });

    it('finds today on the last day of the period, inside the short tail', () => {
      expect(currentWeekIndex(WITH_SHORT_TAIL, '2025-10-30')).toBe(4);
    });
  });
});

describe('todayFromDaysLeft', () => {
  it('counts back from the final bucket, which is the period end', () => {
    // FOUR_WEEKS ends 29 October, so 19 days left is 10 October.
    expect(todayFromDaysLeft(FOUR_WEEKS, 19)).toBe('2025-10-10');
    expect(todayFromDaysLeft(FOUR_WEEKS, 1)).toBe('2025-10-28');
  });

  it('crosses a month boundary the way the calendar does, not by subtracting 30', () => {
    const NOVEMBER_WINDOW = [
      { startDate: '2025-10-15', endDate: '2025-10-22', total: 280 },
      { startDate: '2025-10-22', endDate: '2025-10-29', total: 410 },
      { startDate: '2025-10-29', endDate: '2025-11-15', total: 250 },
    ];

    expect(todayFromDaysLeft(NOVEMBER_WINDOW, 20)).toBe('2025-10-26');
  });

  // The whole point of the function: the answer is the backend's `today`, so it must land
  // inside the bucket the backend would have called current.
  it('composes with currentWeekIndex to select a real bucket', () => {
    const today = todayFromDaysLeft(FOUR_WEEKS, 19)!;

    expect(currentWeekIndex(FOUR_WEEKS, today)).toBe(1);
  });

  it('answers the period end itself at the documented `daysLeft: 0` boundary', () => {
    // `backend/CLAUDE.md`'s Dashboard section: the endpoint resolves the period more than once
    // per request, so `today` can sit on `window.end` for an instant. Outside every bucket, and
    // `currentWeekIndex` says so honestly rather than clamping to the last one.
    expect(todayFromDaysLeft(FOUR_WEEKS, 0)).toBe('2025-10-29');
    expect(currentWeekIndex(FOUR_WEEKS, todayFromDaysLeft(FOUR_WEEKS, 0)!)).toBeNull();
  });

  it('returns null for an empty bucket list, since there is no period end to count from', () => {
    expect(todayFromDaysLeft([], 8)).toBeNull();
  });

  // Total rather than throwing, the same call `parseDraft` makes about sessionStorage: this
  // reads a network response, and a shape it cannot use must not take the card down with it.
  it('returns null rather than throwing on a `daysLeft` no window could produce', () => {
    expect(todayFromDaysLeft(FOUR_WEEKS, -1)).toBeNull();
    expect(todayFromDaysLeft(FOUR_WEEKS, 1.5)).toBeNull();
    expect(todayFromDaysLeft(FOUR_WEEKS, Number.NaN)).toBeNull();
  });

  it('returns null when the final bucket carries a date it cannot parse', () => {
    expect(
      todayFromDaysLeft([{ startDate: '2025-10-01', endDate: 'nope', total: 1 }], 1),
    ).toBeNull();
  });
});
