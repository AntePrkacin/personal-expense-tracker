import {
  addDays,
  addMonths,
  daysInMonth,
  leadingBlanks,
  monthMatrix,
  WEEKDAY_INITIALS,
  WEEKS_IN_GRID,
} from './calendar';

// October 2025 is the month the whole Figma file is drawn in, so it is the worked
// example throughout: 31 days, the 1st on a Wednesday, the 8th the day frame 09 shows.

describe('daysInMonth', () => {
  it.each([
    [2025, 1, 31],
    [2025, 4, 30],
    [2025, 10, 31],
    [2025, 12, 31],
  ])('%d-%d has %d days', (year, month, expected) => {
    expect(daysInMonth(year, month)).toBe(expected);
  });

  // The day-0-of-next-month trick has to get February right without a leap rule
  // written out, so both cases are pinned rather than assumed.
  it('gets February right in a leap year and a common one', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
  });

  it('gets the century rule right', () => {
    // 2000 is a leap year and 1900 is not, which is where a naive `% 4` fails.
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
  });

  it('takes a 1-12 month, so 12 is December rather than rolling into next year', () => {
    expect(daysInMonth(2025, 12)).toBe(31);
  });
});

describe('leadingBlanks', () => {
  it('puts 1 October 2025 in the third column, because the week starts on Monday', () => {
    // Wednesday. getDay() would answer 3 counting from Sunday; counting from Monday it is
    // column 2, so two blanks precede it. The difference between those two numbers is the
    // whole reason this function is named after the blanks rather than the weekday.
    expect(leadingBlanks(2025, 10)).toBe(2);
  });

  it('needs no blanks for a month starting on Monday', () => {
    // February 2021 began on a Monday, which is column 0 in this grid and column 1 in getDay().
    expect(leadingBlanks(2021, 2)).toBe(0);
  });

  it('needs six blanks for a month starting on Sunday, the worst case for grid height', () => {
    // Sunday is the *last* column when the week starts on Monday, so it pushes hardest.
    // getDay() answers 0 here, which is exactly the value that would look like "no blanks".
    expect(leadingBlanks(2026, 3)).toBe(6);
  });

  it('never agrees with getDay(), which is what makes the confusion always a bug', () => {
    // `(getDay() + 6) % 7` is `getDay() - 1` from Monday to Saturday and 6 on Sunday, so the two
    // numberings coincide on **no** day of the week. That is worth pinning rather than deriving:
    // it means a stray `getDay()` used as a column index is always wrong and can never pass by
    // luck on the month somebody happens to be looking at.
    //
    // Every weekday is covered by walking a week rather than by naming four months.
    for (let day = 1; day <= 7; day += 1) {
      const date = new Date(2025, 8, day); // 1-7 September 2025 spans all seven weekdays.
      const month = { year: date.getFullYear(), month: date.getMonth() + 1 };
      const first = new Date(month.year, month.month - 1, 1);

      expect(leadingBlanks(month.year, month.month)).not.toBe(first.getDay());
    }

    // And the conversion itself, stated once against a known pair: 1 March 2026 is a Sunday,
    // which getDay() calls 0 and this grid calls the seventh column.
    expect(new Date(2026, 2, 1).getDay()).toBe(0);
    expect(leadingBlanks(2026, 3)).toBe(6);
  });
});

describe('addMonths', () => {
  it('steps forward and back inside a year', () => {
    expect(addMonths(2025, 10, 1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths(2025, 10, -1)).toEqual({ year: 2025, month: 9 });
  });

  it('rolls the year over in both directions', () => {
    // The two cases the chevrons reach by paging, and the reason year switching needs
    // no separate control: December forward and January back cross the boundary.
    expect(addMonths(2025, 12, 1)).toEqual({ year: 2026, month: 1 });
    expect(addMonths(2025, 1, -1)).toEqual({ year: 2024, month: 12 });
  });

  it('handles a delta larger than a year', () => {
    expect(addMonths(2025, 10, 15)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2025, 10, -22)).toEqual({ year: 2023, month: 12 });
  });

  it('is a no-op for a zero delta', () => {
    expect(addMonths(2025, 10, 0)).toEqual({ year: 2025, month: 10 });
  });

  // The regression the implementation note names: setMonth on a 31st lands in March.
  it('paging from a 31-day month does not skip a month', () => {
    // January to February, which `date.setMonth(date.getMonth() + 1)` on the 31st
    // would turn into March.
    expect(addMonths(2025, 1, 1)).toEqual({ year: 2025, month: 2 });
  });
});

describe('addDays', () => {
  it('steps one day, which is what the left and right arrows move by', () => {
    expect(addDays('2025-10-08', 1)).toBe('2025-10-09');
    expect(addDays('2025-10-08', -1)).toBe('2025-10-07');
  });

  it('steps a week, which is what the up and down arrows move by', () => {
    expect(addDays('2025-10-08', 7)).toBe('2025-10-15');
    expect(addDays('2025-10-08', -7)).toBe('2025-10-01');
  });

  it('carries into the next and previous month', () => {
    // Unlike addMonths, rolling over is wanted here: arrowing right off the 31st should
    // land on the 1st rather than refuse.
    expect(addDays('2025-10-31', 1)).toBe('2025-11-01');
    expect(addDays('2025-10-01', -1)).toBe('2025-09-30');
  });

  it('carries across a year boundary', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
  });

  it('lands on 29 February in a leap year and skips it otherwise', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('is null for a string that is not a calendar date', () => {
    expect(addDays('', 1)).toBeNull();
    expect(addDays('2025-02-30', 1)).toBeNull();
  });

  it('is a no-op for a zero delta', () => {
    expect(addDays('2025-10-08', 0)).toBe('2025-10-08');
  });
});

describe('WEEKDAY_INITIALS', () => {
  it('is seven headings starting at Monday and ending at Sunday', () => {
    expect(WEEKDAY_INITIALS).toHaveLength(7);
    expect(WEEKDAY_INITIALS[0]).toBe('M');
    expect(WEEKDAY_INITIALS[5]).toBe('S');
    expect(WEEKDAY_INITIALS[6]).toBe('S');
    expect([...WEEKDAY_INITIALS].join('')).toBe('MTWTFSS');
  });
});

describe('monthMatrix', () => {
  it('is always six rows of seven, whatever the month', () => {
    // The fixed height that stops the popover reflowing as it is paged. February 2025
    // spans four weeks and October 2025 five; both still return six rows.
    for (const [year, month] of [
      [2025, 2],
      [2025, 10],
      [2026, 3],
    ] as const) {
      const grid = monthMatrix(year, month);

      expect(grid).toHaveLength(WEEKS_IN_GRID);
      for (const row of grid) expect(row).toHaveLength(7);
    }
  });

  it('lays October 2025 out against the calendar', () => {
    const grid = monthMatrix(2025, 10);

    // The 1st is a Wednesday, which is column 2 in a Monday-first week - so two leading blanks,
    // and the row runs Mon..Sun ending on Sunday the 5th.
    expect(grid[0]).toEqual([
      null,
      null,
      '2025-10-01',
      '2025-10-02',
      '2025-10-03',
      '2025-10-04',
      '2025-10-05',
    ]);

    // The 8th, which frame 09 shows, is the Wednesday of the second row.
    expect(grid[1]![2]).toBe('2025-10-08');
  });

  it('starts every row on a Monday and ends it on a Sunday', () => {
    // The property the column headings promise. Checked through Date rather than through the
    // grid's own arithmetic, so it cannot agree with a bug in leadingBlanks.
    for (const row of monthMatrix(2025, 10)) {
      const first = row.find((cell) => cell !== null);
      if (first === undefined) continue;

      const index = row.indexOf(first);
      const day = new Date(`${first}T00:00:00`).getDay();
      // Monday is 1 in getDay(); column 0 must therefore be a Monday, column 6 a Sunday.
      expect((day + 6) % 7).toBe(index);
    }
  });

  it('holds every day of the month exactly once, and nothing else', () => {
    const days = monthMatrix(2025, 10)
      .flat()
      .filter((cell): cell is string => cell !== null);

    expect(days).toHaveLength(31);
    expect(new Set(days).size).toBe(31);
    expect(days[0]).toBe('2025-10-01');
    expect(days[30]).toBe('2025-10-31');
    // Ascending, so the grid reads left to right and top to bottom.
    expect([...days].sort()).toEqual(days);
  });

  it('pads the trailing cells with null rather than next month', () => {
    const grid = monthMatrix(2025, 10);

    // 31 days plus 2 leading blanks is 33 cells, so the last 9 of 42 are empty.
    expect(grid[4]!.slice(5)).toEqual([null, null]);
    expect(grid[5]).toEqual([null, null, null, null, null, null, null]);
  });

  it('emits 29 February only in a leap year', () => {
    expect(monthMatrix(2024, 2).flat()).toContain('2024-02-29');
    expect(monthMatrix(2025, 2).flat()).not.toContain('2025-02-29');
    expect(monthMatrix(2025, 2).flat().filter(Boolean)).toHaveLength(28);
  });

  it('fits the worst case, a 31-day month starting on Sunday', () => {
    // 6 leading blanks plus 31 days is 37 cells, which needs all six rows. This is the case
    // that proves the grid is never too small - and the worst case moved from Saturday to
    // Sunday when the week started on Monday, which is why it is spelled out.
    const grid = monthMatrix(2026, 3);

    expect(leadingBlanks(2026, 3)).toBe(6);
    expect(grid.flat().filter(Boolean)).toHaveLength(31);
    expect(grid[5]!.some((cell) => cell !== null)).toBe(true);
  });

  it('spans a February that is exactly four weeks without leaving a stray day', () => {
    // 2021's February started on a Monday with 28 days: exactly four rows of content and two
    // empty ones after it. The example changed with the first day of the week - 2015's February
    // started on a Sunday, which is now the *last* column and spans five rows.
    const grid = monthMatrix(2021, 2);

    expect(leadingBlanks(2021, 2)).toBe(0);
    expect(grid[0]).toEqual([
      '2021-02-01',
      '2021-02-02',
      '2021-02-03',
      '2021-02-04',
      '2021-02-05',
      '2021-02-06',
      '2021-02-07',
    ]);
    expect(grid[4]).toEqual([null, null, null, null, null, null, null]);
    expect(grid[5]).toEqual([null, null, null, null, null, null, null]);
  });
});
