import { currentWeekIndex } from './weeks';

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
