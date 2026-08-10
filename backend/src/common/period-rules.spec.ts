import {
  nextPeriod,
  periodFor,
  periodLabel,
  periodsBetween,
  previousPeriod,
  transitionStartFor,
  type PeriodRule,
} from './period-rules';

/** A rule literal, so each test reads as the schedule it describes. */
function rule(
  effectiveFrom: string,
  monthStartDay: number,
  transitionStart: string | null = null,
): PeriodRule {
  return { effectiveFrom, monthStartDay, transitionStart };
}

describe('periodFor, with one rule', () => {
  // The single-rule account: every case `month-window.spec.ts` used to run
  // against `monthWindow` lives here now, because one rule tiling forever is
  // exactly what that function was.
  const firstOfMonth = [rule('2026-01-01', 1)];
  const fifteenth = [rule('2026-01-15', 15)];

  it('runs 1st to 1st for the default month start', () => {
    expect(periodFor(firstOfMonth, '2026-08-04')).toEqual({
      start: '2026-08-01',
      end: '2026-09-01',
      label: 'August 2026',
    });
  });

  it('includes the start day itself', () => {
    // The boundary day belongs to the period it opens, not the one it closes.
    expect(periodFor(fifteenth, '2026-08-15')).toMatchObject({
      start: '2026-08-15',
      end: '2026-09-15',
    });
  });

  it('puts the day before the start day in the previous period', () => {
    expect(periodFor(fifteenth, '2026-08-14')).toMatchObject({
      start: '2026-07-15',
      end: '2026-08-15',
    });
  });

  it('rolls December into January', () => {
    expect(periodFor(fifteenth, '2026-12-20')).toMatchObject({
      start: '2026-12-15',
      end: '2027-01-15',
    });
  });

  it('rolls January back into December', () => {
    expect(periodFor(fifteenth, '2027-01-10')).toMatchObject({
      start: '2026-12-15',
      end: '2027-01-15',
    });
  });

  it('spans February without any month-length arithmetic', () => {
    // 28 is the ceiling precisely so February always has the day, in a leap
    // year and out of one.
    const twentyEighth = [rule('2024-01-28', 28)];
    expect(periodFor(twentyEighth, '2026-02-28')).toMatchObject({
      start: '2026-02-28',
      end: '2026-03-28',
    });
    expect(periodFor(twentyEighth, '2024-02-28')).toMatchObject({
      start: '2024-02-28',
      end: '2024-03-28',
    });
  });

  it('produces periods that tile without gap or overlap', () => {
    // One period's end is the next one's start, which is what makes the
    // half-open bounds safe to use as a filter.
    const first = periodFor(fifteenth, '2026-08-20');
    expect(nextPeriod(fifteenth, first).start).toBe(first.end);
  });

  it('extends the earliest rule backward, for a transaction backdated before the account', () => {
    // A period must exist for any date a transaction can carry, including one
    // predating the rule itself. The boundaries land exactly on the anchor
    // walking back, because the anchor's day *is* the rule's monthStartDay.
    expect(periodFor(fifteenth, '2025-03-20')).toMatchObject({
      start: '2025-03-15',
      end: '2025-04-15',
    });
    expect(periodFor(fifteenth, '2026-01-14')).toMatchObject({
      start: '2025-12-15',
      end: '2026-01-15',
    });
  });

  it('extends the latest rule forward, so there is always a next period', () => {
    expect(periodFor(fifteenth, '2031-06-01')).toMatchObject({
      start: '2031-05-15',
      end: '2031-06-15',
    });
  });
});

describe('periodFor, across a schedule change', () => {
  // The ticket's worked case, and the one the user story walks: paid on the 1st,
  // changing to the 14th, first new paycheck 14 January 2026. Arrears removes
  // the 1 January boundary, so December stretches to 14 January.
  const rules = [rule('2025-01-01', 1), rule('2026-01-14', 14, '2025-12-01')];

  it('leaves every period before the change exactly as it was', () => {
    expect(periodFor(rules, '2025-11-15')).toMatchObject({
      start: '2025-11-01',
      end: '2025-12-01',
    });
  });

  it('stretches the last old period to T', () => {
    expect(periodFor(rules, '2025-12-05')).toEqual({
      start: '2025-12-01',
      end: '2026-01-14',
      label: 'December 2025 / January 2026',
    });
  });

  it('keeps the stretched period all the way to the day before T', () => {
    expect(periodFor(rules, '2026-01-13')).toMatchObject({
      start: '2025-12-01',
      end: '2026-01-14',
    });
  });

  it('starts the new schedule on T itself', () => {
    expect(periodFor(rules, '2026-01-14')).toMatchObject({
      start: '2026-01-14',
      end: '2026-02-14',
    });
  });

  it('never opens a period on the removed boundary', () => {
    // The whole point of the transition period: that paycheck never arrives, so
    // no period may start on 1 January and claim a budget nobody was paid.
    const starts = periodsBetween(rules, '2025-10-01', '2026-03-01').map(
      (period) => period.start,
    );
    expect(starts).not.toContain('2026-01-01');
  });

  it('tiles the new schedule forward from T', () => {
    expect(periodFor(rules, '2026-05-20')).toMatchObject({
      start: '2026-05-14',
      end: '2026-06-14',
    });
  });

  it('steps backward out of the new schedule into the stretched period', () => {
    const january = periodFor(rules, '2026-01-14');
    expect(previousPeriod(rules, january)).toMatchObject({
      start: '2025-12-01',
      end: '2026-01-14',
    });
  });

  it('steps backward out of the stretched period into the old schedule', () => {
    const transition = periodFor(rules, '2025-12-05');
    expect(previousPeriod(rules, transition)).toMatchObject({
      start: '2025-11-01',
      end: '2025-12-01',
    });
  });

  it('steps forward out of the stretched period onto T', () => {
    const transition = periodFor(rules, '2025-12-05');
    expect(nextPeriod(rules, transition)).toMatchObject({
      start: '2026-01-14',
      end: '2026-02-14',
    });
  });
});

describe('periodFor, with T in the future', () => {
  // A schedule change may be filed before the first new paycheck arrives, and
  // then the *current* period is already the stretched one - which is what makes
  // the change visible immediately rather than in six weeks.
  const rules = [rule('2025-01-01', 1), rule('2026-03-14', 14, '2026-02-01')];

  it('stretches the period containing today, before T arrives', () => {
    expect(periodFor(rules, '2026-02-10')).toMatchObject({
      start: '2026-02-01',
      end: '2026-03-14',
    });
  });

  it('still tiles the old schedule up to the stretched period', () => {
    expect(periodFor(rules, '2026-01-20')).toMatchObject({
      start: '2026-01-01',
      end: '2026-02-01',
    });
  });
});

describe('periodFor, with two changes inside two periods', () => {
  // `transitionStartFor`'s clamp, seen from the read side: the middle rule was
  // in force for less than two of its own periods, so it produces no ordinary
  // period at all and the whole of it is one short transition.
  const rules = [
    rule('2025-01-01', 1),
    rule('2026-01-14', 14, '2025-12-01'),
    rule('2026-01-20', 20, '2026-01-14'),
  ];

  it('makes the short-lived rule one transition period', () => {
    expect(periodFor(rules, '2026-01-15')).toMatchObject({
      start: '2026-01-14',
      end: '2026-01-20',
    });
  });

  it('opens the newest schedule on its own T', () => {
    expect(periodFor(rules, '2026-01-20')).toMatchObject({
      start: '2026-01-20',
      end: '2026-02-20',
    });
  });

  it('still ends the oldest rule at the first bridge', () => {
    expect(periodFor(rules, '2025-12-10')).toMatchObject({
      start: '2025-12-01',
      end: '2026-01-14',
    });
  });
});

describe('periodFor, with a zero-length transition', () => {
  // A stored `transitionStart` equal to T means no boundary was removed, which
  // is a legitimate state and must produce no empty period.
  const rules = [rule('2026-01-01', 1), rule('2026-03-01', 1, '2026-03-01')];

  it('runs the old segment right up to T', () => {
    expect(periodFor(rules, '2026-02-15')).toMatchObject({
      start: '2026-02-01',
      end: '2026-03-01',
    });
  });

  it('emits no empty period', () => {
    const periods = periodsBetween(rules, '2026-01-01', '2026-04-01');
    expect(periods.every((period) => period.end > period.start)).toBe(true);
  });
});

describe('periodFor, rejecting what cannot be walked', () => {
  it('rejects an account with no rules at all', () => {
    expect(() => periodFor([], '2026-08-04')).toThrow(
      /at least one period rule/,
    );
  });

  it('rejects a month start no rule could have stored', () => {
    expect(() => periodFor([rule('2026-01-01', 0)], '2026-08-04')).toThrow(
      /between 1 and 28/,
    );
    expect(() => periodFor([rule('2026-01-29', 29)], '2026-08-04')).toThrow(
      /between 1 and 28/,
    );
    expect(() => periodFor([rule('2026-01-01', 1.5)], '2026-08-04')).toThrow(
      /between 1 and 28/,
    );
  });

  it('rejects a rule anchored off its own month start day', () => {
    // The invariant that makes the tiling total: T is a paycheck date, and a
    // period starts on every paycheck.
    expect(() => periodFor([rule('2026-01-05', 14)], '2026-08-04')).toThrow(
      /must fall on its own monthStartDay/,
    );
  });

  it('rejects a date that is not YYYY-MM-DD', () => {
    expect(() => periodFor([rule('2026-01-01', 1)], '04/08/2026')).toThrow(
      /YYYY-MM-DD/,
    );
  });

  it('accepts rules in any order', () => {
    // The service reads them ordered; the walk sorts anyway, because an
    // unordered array producing overlapping periods is a bug nothing would
    // catch.
    const unordered = [
      rule('2026-01-14', 14, '2025-12-01'),
      rule('2025-01-01', 1),
    ];
    expect(periodFor(unordered, '2025-12-05')).toMatchObject({
      start: '2025-12-01',
      end: '2026-01-14',
    });
  });
});

describe('periodsBetween', () => {
  const rules = [rule('2025-01-01', 1), rule('2026-01-14', 14, '2025-12-01')];

  it('enumerates the exact layout across the change, oldest first', () => {
    expect(
      periodsBetween(rules, '2025-10-15', '2026-02-20').map((period) => [
        period.start,
        period.end,
      ]),
    ).toEqual([
      ['2025-10-01', '2025-11-01'],
      ['2025-11-01', '2025-12-01'],
      ['2025-12-01', '2026-01-14'],
      ['2026-01-14', '2026-02-14'],
      ['2026-02-14', '2026-03-14'],
    ]);
  });

  it('yields the containing period whole, not a fragment of it', () => {
    const periods = periodsBetween(rules, '2025-10-15', '2025-10-20');
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({
      start: '2025-10-01',
      end: '2025-11-01',
    });
  });

  it('tiles with no gap and no overlap across the change', () => {
    const periods = periodsBetween(rules, '2025-06-01', '2026-06-01');
    periods.slice(1).forEach((period, index) => {
      expect(period.start).toBe(periods[index].end);
    });
  });

  it('rejects a range that runs backwards', () => {
    expect(() => periodsBetween(rules, '2026-01-01', '2025-01-01')).toThrow(
      /from <= to/,
    );
  });
});

describe('transitionStartFor', () => {
  it('removes the boundary immediately before T and keeps the one before that', () => {
    // The ticket's own worked example: on a 1st-of-month schedule with T on 14
    // January, 1 January goes and December stretches.
    expect(transitionStartFor(rule('2025-01-01', 1), '2026-01-14')).toBe(
      '2025-12-01',
    );
  });

  it('treats a T landing exactly on an old boundary as that boundary going too', () => {
    // T is a paycheck date; if it coincides with an old boundary, the old
    // paycheck due that day is the one that never arrives.
    expect(transitionStartFor(rule('2025-01-01', 1), '2026-01-01')).toBe(
      '2025-11-01',
    );
  });

  it('reads the same for a retroactive T as for a future one', () => {
    // No clock is involved anywhere, which is what makes a retroactive change
    // and a scheduled one the same write.
    expect(transitionStartFor(rule('2020-01-01', 1), '2021-06-14')).toBe(
      '2021-05-01',
    );
    expect(transitionStartFor(rule('2020-01-01', 1), '2031-06-14')).toBe(
      '2031-05-01',
    );
  });

  it('works off a non-first month start day', () => {
    expect(transitionStartFor(rule('2025-03-25', 25), '2026-02-10')).toBe(
      '2025-12-25',
    );
  });

  it('clamps at the active rule anchor rather than deleting the previous change', () => {
    // Two changes inside two periods: a month before the removed boundary
    // predates this rule entirely, and reaching past its anchor would delete the
    // previous change's own T.
    expect(transitionStartFor(rule('2026-01-14', 14), '2026-01-20')).toBe(
      '2026-01-14',
    );
  });

  it('rolls back across a year boundary', () => {
    expect(transitionStartFor(rule('2024-01-01', 1), '2026-01-20')).toBe(
      '2025-12-01',
    );
  });
});

describe('periodLabel', () => {
  it('names a period that sits inside one month by that month', () => {
    expect(periodLabel('2025-10-01', '2025-11-01')).toBe('October 2025');
  });

  it('names a period by both months it touches', () => {
    // Paid on the 25th: these five weeks genuinely are October and November.
    expect(periodLabel('2025-10-25', '2025-11-25')).toBe(
      'October / November 2025',
    );
  });

  it('writes the year once when both months share it', () => {
    expect(periodLabel('2025-10-05', '2025-11-05')).toBe(
      'October / November 2025',
    );
  });

  it('writes both years when the period crosses one', () => {
    expect(periodLabel('2025-12-01', '2026-01-14')).toBe(
      'December 2025 / January 2026',
    );
  });

  it('decides on the last included day, not the exclusive end', () => {
    // Ending on 1 November means the period's last day is 31 October, so this is
    // October alone. Deciding on `end` would name November too.
    expect(periodLabel('2025-10-01', '2025-11-01')).toBe('October 2025');
  });

  it('names a long stretch by its first and last month only', () => {
    expect(periodLabel('2025-11-01', '2026-02-14')).toBe(
      'November 2025 / February 2026',
    );
  });

  it('refuses an empty period', () => {
    expect(() => periodLabel('2026-01-01', '2026-01-01')).toThrow(
      /must be non-empty/,
    );
  });
});
