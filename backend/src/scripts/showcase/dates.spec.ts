import { dateMonthsAgo, hasHappened, parseDate } from './dates';

describe('parseDate', () => {
  it('reads a YYYY-MM-DD string as a zero-based month', () => {
    expect(parseDate('2026-08-09')).toEqual({ year: 2026, month: 7, day: 9 });
  });

  it('rejects anything else, rather than returning NaN fields', () => {
    expect(() => parseDate('09/08/2026')).toThrow(/YYYY-MM-DD/);
  });
});

describe('dateMonthsAgo', () => {
  it('walks back inside one year', () => {
    expect(dateMonthsAgo({ year: 2026, month: 7 }, 3, 14)).toBe('2026-05-14');
  });

  // The year carry is the whole reason this function exists rather than a Date:
  // handing a negative month to `new Date` works, but round-tripping a calendar
  // date through one shifts it across timezones.
  it('carries backwards across January', () => {
    expect(dateMonthsAgo({ year: 2026, month: 1 }, 3, 5)).toBe('2025-11-05');
  });

  it('carries across more than a whole year', () => {
    expect(dateMonthsAgo({ year: 2026, month: 7 }, 35, 1)).toBe('2023-09-01');
  });

  it('zero-pads the month and the day', () => {
    expect(dateMonthsAgo({ year: 2026, month: 0 }, 0, 3)).toBe('2026-01-03');
  });
});

describe('hasHappened', () => {
  const MAX_DAY = 28;

  it('keeps everything in a past month, whatever the day', () => {
    expect(hasHappened({ monthsAgo: 1, day: 28 }, { day: 9 }, MAX_DAY)).toBe(
      true,
    );
  });

  it('drops a current-month transaction dated after today', () => {
    expect(hasHappened({ monthsAgo: 0, day: 28 }, { day: 9 }, MAX_DAY)).toBe(
      false,
    );
  });

  it('keeps a current-month transaction dated before today', () => {
    expect(hasHappened({ monthsAgo: 0, day: 3 }, { day: 9 }, MAX_DAY)).toBe(
      true,
    );
  });

  // Deliberate: excluding it empties the whole current month when the seed runs
  // on the 1st, which is the day a fresh seed is most likely to be demoed.
  it('includes the seeding day itself', () => {
    expect(hasHappened({ monthsAgo: 0, day: 9 }, { day: 9 }, MAX_DAY)).toBe(
      true,
    );
  });

  it('keeps the whole month when seeded past the 28th', () => {
    expect(hasHappened({ monthsAgo: 0, day: 28 }, { day: 31 }, MAX_DAY)).toBe(
      true,
    );
  });

  it('keeps only the 1st when seeded on the 1st', () => {
    expect(hasHappened({ monthsAgo: 0, day: 1 }, { day: 1 }, MAX_DAY)).toBe(
      true,
    );
    expect(hasHappened({ monthsAgo: 0, day: 2 }, { day: 1 }, MAX_DAY)).toBe(
      false,
    );
  });
});
