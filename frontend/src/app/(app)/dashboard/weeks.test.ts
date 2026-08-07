import { RANGE_DASH, bucketRangeLabel, currentWeekIndex, todayFromDaysLeft } from './weeks';

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

describe('bucketRangeLabel', () => {
  // The whole point of this function, and the assertion to break first if somebody "simplifies"
  // it: `endDate` is exclusive, so an ordinary week ends the day *before* the date on the wire.
  // Rendering `endDate` verbatim gives "Oct 1 – Oct 8" here, which collides with Week 2's own
  // start and is wrong in a way that looks entirely plausible.
  it('ends on the day before the exclusive endDate', () => {
    expect(bucketRangeLabel(FOUR_WEEKS[0]!)).toBe(`Oct 1 ${RANGE_DASH} Oct 7`);
    expect(bucketRangeLabel(FOUR_WEEKS[1]!)).toBe(`Oct 8 ${RANGE_DASH} Oct 14`);
  });

  it('gives adjacent buckets no overlapping date', () => {
    // The property the assertion above is really about, stated directly: whatever the formatting,
    // no week may end on the day the next one begins.
    const labels = FOUR_WEEKS.map(bucketRangeLabel);

    expect(labels).toEqual([
      `Oct 1 ${RANGE_DASH} Oct 7`,
      `Oct 8 ${RANGE_DASH} Oct 14`,
      `Oct 15 ${RANGE_DASH} Oct 21`,
      `Oct 22 ${RANGE_DASH} Oct 28`,
    ]);
  });

  // The case the card cannot explain without this label: `weeklyBucketsOf` ends its last bucket
  // at the period end, so a short stub is drawn beside full weeks and labelled "Week 4" like any
  // other. Three days, and the range is the only thing that says so.
  it('tells the truth about a short final bucket', () => {
    expect(bucketRangeLabel({ startDate: '2025-10-22', endDate: '2025-10-25', total: 90 })).toBe(
      `Oct 22 ${RANGE_DASH} Oct 24`,
    );
  });

  it('collapses a one-day bucket to a single date', () => {
    expect(bucketRangeLabel({ startDate: '2025-10-22', endDate: '2025-10-23', total: 12 })).toBe(
      'Oct 22',
    );
  });

  it('crosses a month boundary, which every non-default monthStartDay produces', () => {
    // At `monthStartDay: 15` the window runs 15 October to 15 November, so most of its buckets
    // straddle the two - the same fact that stopped this card's caption naming a month.
    expect(bucketRangeLabel({ startDate: '2025-10-29', endDate: '2025-11-05', total: 40 })).toBe(
      `Oct 29 ${RANGE_DASH} Nov 4`,
    );
  });

  it('names no year, matching the DATE column in the transactions table', () => {
    expect(bucketRangeLabel(FOUR_WEEKS[0]!)).not.toMatch(/2025/);
  });

  // Total, like the two above it. A tooltip reading "Invalid Date" is worse than one reading
  // nothing, and this parses a network response.
  it.each([
    ['an unparseable endDate', { startDate: '2025-10-01', endDate: 'nope', total: 1 }],
    ['an unparseable startDate', { startDate: 'nope', endDate: '2025-10-08', total: 1 }],
    ['both empty', { startDate: '', endDate: '', total: 0 }],
  ])('returns an empty string for %s', (_label, bucket) => {
    expect(bucketRangeLabel(bucket)).toBe('');
  });
});
