import {
  addDays,
  daysBetween,
  daysLeftInWindow,
  todayIn,
} from './month-window';

// `monthWindow` and `previousMonthWindow` used to be tested here and PET-72
// moved the tiling they did into `period-rules.ts`, which owns those cases now -
// including the boundary-day, year-roll and February ones, run through a
// single-rule account. What is left in this file is arithmetic with no notion of
// a budgeting period, so nothing below constructs a window from a rule.

describe('daysBetween', () => {
  it('counts a plain span', () => {
    expect(daysBetween('2026-08-01', '2026-08-04')).toBe(3);
  });

  it('counts zero for the same day', () => {
    expect(daysBetween('2026-08-04', '2026-08-04')).toBe(0);
  });

  it('counts across a month boundary', () => {
    expect(daysBetween('2026-08-30', '2026-09-02')).toBe(3);
  });

  it('counts the leap day in a leap year and not otherwise', () => {
    expect(daysBetween('2024-02-01', '2024-03-01')).toBe(29);
    expect(daysBetween('2026-02-01', '2026-03-01')).toBe(28);
  });

  it('counts across a century that is not a leap year', () => {
    // 1900 is divisible by 4 but not a leap year; 2000 is.
    expect(daysBetween('1900-02-01', '1900-03-01')).toBe(28);
    expect(daysBetween('2000-02-01', '2000-03-01')).toBe(29);
  });
});

describe('daysLeftInWindow', () => {
  const august = { start: '2026-08-01', end: '2026-09-01' };

  it('counts today as a day still remaining', () => {
    // The 31st is the last day of the period, and it is not over.
    expect(daysLeftInWindow(august, '2026-08-31')).toBe(1);
  });

  it('counts the whole period on its first day', () => {
    expect(daysLeftInWindow(august, '2026-08-01')).toBe(31);
  });

  it('counts down through the period', () => {
    expect(
      daysLeftInWindow(
        { start: '2026-08-15', end: '2026-09-15' },
        '2026-09-14',
      ),
    ).toBe(1);
  });

  it('counts a stretched transition period, which is longer than a month', () => {
    // The window PET-72 introduced: December stretching to 14 January. Nothing
    // in this function assumes a period is a month, and this is what pins that.
    expect(
      daysLeftInWindow(
        { start: '2025-12-01', end: '2026-01-14' },
        '2025-12-05',
      ),
    ).toBe(40);
  });
});

describe('addDays', () => {
  it('adds a plain span within a month', () => {
    expect(addDays('2026-08-01', 3)).toBe('2026-08-04');
  });

  it('carries across a month boundary', () => {
    expect(addDays('2026-08-30', 3)).toBe('2026-09-02');
  });

  it('carries across a year boundary', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('lands on the leap day in a leap year and skips it otherwise', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('carries across a century that is not a leap year', () => {
    expect(addDays('1900-02-28', 1)).toBe('1900-03-01');
    expect(addDays('2000-02-28', 1)).toBe('2000-02-29');
  });

  it('subtracts on a negative count', () => {
    expect(addDays('2026-08-04', -3)).toBe('2026-08-01');
    expect(addDays('2026-09-02', -3)).toBe('2026-08-30');
  });

  it('is a no-op for zero days', () => {
    expect(addDays('2026-08-04', 0)).toBe('2026-08-04');
  });

  it('round-trips through daysBetween for an arbitrary span', () => {
    // The property the weekly-bucket math actually leans on: adding the exact
    // gap `daysBetween` reports lands back on the second date, whatever it is.
    const from = '2026-01-15';
    const to = '2027-03-02';
    expect(addDays(from, daysBetween(from, to))).toBe(to);
  });

  it('round-trips across a wide span of consecutive days without drifting', () => {
    // Walks a leap year and a non-leap year back to back, one day at a time,
    // so a boundary bug anywhere in the run would surface as a mismatch.
    let date = '2023-12-01';
    for (let i = 1; i <= 500; i++) {
      date = addDays(date, 1);
      expect(date).toBe(addDays('2023-12-01', i));
    }
    expect(date).toBe('2025-04-14');
  });
});

describe('todayIn', () => {
  it('formats as YYYY-MM-DD', () => {
    const at = new Date('2026-08-04T12:00:00Z');
    expect(todayIn('Europe/Zagreb', at)).toBe('2026-08-04');
  });

  it('is the configured zone, not UTC - which is the whole point', () => {
    // 23:30 UTC is already the next day in Zagreb (UTC+2 in August). Resolving
    // the period in UTC here would file a transaction into the wrong month for
    // a couple of hours on the boundary day.
    const lateUtc = new Date('2026-08-04T23:30:00Z');
    expect(todayIn('UTC', lateUtc)).toBe('2026-08-04');
    expect(todayIn('Europe/Zagreb', lateUtc)).toBe('2026-08-05');
  });

  it('handles a zone behind UTC too', () => {
    const earlyUtc = new Date('2026-08-04T02:00:00Z');
    expect(todayIn('America/New_York', earlyUtc)).toBe('2026-08-03');
  });

  it('pads single-digit months and days', () => {
    const at = new Date('2026-01-05T12:00:00Z');
    expect(todayIn('Europe/Zagreb', at)).toBe('2026-01-05');
  });
});
