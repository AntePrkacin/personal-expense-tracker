import {
  addDays,
  daysBetween,
  daysLeftInWindow,
  monthWindow,
  previousMonthWindow,
  todayIn,
} from './month-window';

describe('monthWindow', () => {
  it('runs 1st to 1st for the default month start', () => {
    expect(monthWindow(1, '2026-08-04')).toEqual({
      start: '2026-08-01',
      end: '2026-09-01',
    });
  });

  it('includes the start day itself', () => {
    // The boundary day belongs to the period it opens, not the one it closes.
    expect(monthWindow(15, '2026-08-15')).toEqual({
      start: '2026-08-15',
      end: '2026-09-15',
    });
  });

  it('puts the day before the start day in the previous period', () => {
    expect(monthWindow(15, '2026-08-14')).toEqual({
      start: '2026-07-15',
      end: '2026-08-15',
    });
  });

  it('rolls December into January', () => {
    expect(monthWindow(15, '2026-12-20')).toEqual({
      start: '2026-12-15',
      end: '2027-01-15',
    });
  });

  it('rolls January back into December', () => {
    expect(monthWindow(15, '2027-01-10')).toEqual({
      start: '2026-12-15',
      end: '2027-01-15',
    });
  });

  it('spans February without any month-length arithmetic', () => {
    // 28 is the profile's ceiling precisely so February always has the day,
    // in a leap year and out of one.
    expect(monthWindow(28, '2026-02-28')).toEqual({
      start: '2026-02-28',
      end: '2026-03-28',
    });
    expect(monthWindow(28, '2024-02-28')).toEqual({
      start: '2024-02-28',
      end: '2024-03-28',
    });
  });

  it('produces windows that tile without gap or overlap', () => {
    // One period's end is the next one's start, which is what makes the
    // half-open bounds safe to use as a filter.
    const first = monthWindow(15, '2026-08-20');
    const next = monthWindow(15, first.end);
    expect(next.start).toBe(first.end);
  });

  it('rejects a month start the profile could not have stored', () => {
    expect(() => monthWindow(0, '2026-08-04')).toThrow(/between 1 and 28/);
    expect(() => monthWindow(29, '2026-08-04')).toThrow(/between 1 and 28/);
    expect(() => monthWindow(1.5, '2026-08-04')).toThrow(/between 1 and 28/);
  });

  it('rejects a date that is not YYYY-MM-DD', () => {
    expect(() => monthWindow(1, '04/08/2026')).toThrow(/YYYY-MM-DD/);
  });
});

describe('previousMonthWindow', () => {
  it('steps back one month, not thirty days', () => {
    expect(previousMonthWindow(15, '2026-08-20')).toEqual({
      start: '2026-07-15',
      end: '2026-08-15',
    });
  });

  it('ends exactly where the current window starts', () => {
    const current = monthWindow(15, '2026-08-20');
    expect(previousMonthWindow(15, '2026-08-20').end).toBe(current.start);
  });

  it('rolls back across the year boundary', () => {
    expect(previousMonthWindow(15, '2027-01-20')).toEqual({
      start: '2026-12-15',
      end: '2027-01-15',
    });
  });

  it('steps back from a February window without losing days', () => {
    // A naive minus-30-days would land in the wrong month here.
    expect(previousMonthWindow(28, '2026-03-01')).toEqual({
      start: '2026-01-28',
      end: '2026-02-28',
    });
  });
});

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
  it('counts today as a day still remaining', () => {
    const window = monthWindow(1, '2026-08-31');
    // The 31st is the last day of the period, and it is not over.
    expect(daysLeftInWindow(window, '2026-08-31')).toBe(1);
  });

  it('counts the whole period on its first day', () => {
    const window = monthWindow(1, '2026-08-01');
    expect(daysLeftInWindow(window, '2026-08-01')).toBe(31);
  });

  it('counts down through the period', () => {
    const window = monthWindow(15, '2026-08-20');
    expect(daysLeftInWindow(window, '2026-09-14')).toBe(1);
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
