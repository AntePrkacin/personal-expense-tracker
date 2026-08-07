// The zone is pinned before the module is imported, and that is the whole point of
// this file rather than a detail of it.
//
// `todayIsoDate` is protected against exactly one regression - somebody
// "simplifying" it to `new Date().toISOString().slice(0, 10)` - and that regression
// is **invisible under TZ=UTC**, where the two agree for every instant. Jest pins no
// zone here and CI runners are UTC, so a suite that just called the function would be
// weakest precisely where it runs.
//
// So the zones are set explicitly. Node calls tzset on a `process.env.TZ` write, so
// assigning it before the first Date operation in this worker really does move the
// clock. Two zones on opposite sides of UTC are needed because `toISOString` fails in
// opposite directions: behind UTC it reports tomorrow for a late-evening local time,
// ahead of UTC it reports yesterday for an early-morning one. Either zone alone lets
// half the bug through.
const ORIGINAL_TZ = process.env.TZ;

import { dateFromIso, isoFromParts, partsFromIso, todayIsoDate } from './date';

/**
 * Puts `TZ` back the way it was found.
 *
 * **A plain `process.env.TZ = ORIGINAL_TZ` does not do that**, because `TZ` is unset here -
 * `jest.config.ts` pins no zone - and writing `undefined` into a `process.env` key stores the
 * *string* `"undefined"`. Node's tzset rejects that and falls back to UTC, so every assertion
 * after the first `inZone` would run under UTC rather than the machine's own zone. That is
 * benign in this file, where every zone-sensitive test pins its zone explicitly, and it is the
 * whole point of the one in `format.test.ts` - so both restore the same way rather than one of
 * them relying on being the harmless copy.
 */
function restoreTz() {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
}

afterAll(restoreTz);

/** Runs `body` with the process pinned to `zone`. */
function inZone(zone: string, body: () => void) {
  process.env.TZ = zone;
  try {
    body();
  } finally {
    restoreTz();
  }
}

describe('todayIsoDate', () => {
  // The pair that fails on any machine if toISOString comes back. In New York
  // (UTC-4/-5) the late instant is already tomorrow in UTC; in Berlin (UTC+1/+2) the
  // early instant is still yesterday.
  it.each([
    ['America/New_York', 'the late-evening instant'],
    ['Europe/Berlin', 'the early-morning instant'],
  ])('answers the local day in %s, whichever side of UTC it is (%s)', (zone) => {
    inZone(zone, () => {
      expect(todayIsoDate(new Date(2025, 9, 8, 0, 30))).toBe('2025-10-08');
      expect(todayIsoDate(new Date(2025, 9, 8, 23, 30))).toBe('2025-10-08');
    });
  });

  it('pads a single-digit month and day', () => {
    // '2025-1-5' would satisfy a lazy implementation and be rejected by the DTO's
    // own `@Matches(/^\d{4}-\d{2}-\d{2}$/)`.
    expect(todayIsoDate(new Date(2025, 0, 5))).toBe('2025-01-05');
  });

  it('handles a leap day', () => {
    expect(todayIsoDate(new Date(2024, 1, 29))).toBe('2024-02-29');
  });

  it('reads the clock when given no argument', () => {
    jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8, 12, 0));

    expect(todayIsoDate()).toBe('2025-10-08');

    jest.useRealTimers();
  });
});

describe('isoFromParts', () => {
  it('takes a 1-12 month, not a 0-11 one', () => {
    // The whole module uses human numbering; October is 10 here and 9 only inside a
    // Date constructor.
    expect(isoFromParts(2025, 10, 8)).toBe('2025-10-08');
  });

  it('pads both fields', () => {
    expect(isoFromParts(2025, 1, 5)).toBe('2025-01-05');
  });
});

describe('partsFromIso', () => {
  it('reads a well-formed date back as 1-12 parts', () => {
    expect(partsFromIso('2025-10-08')).toEqual({ year: 2025, month: 10, day: 8 });
  });

  it('round-trips with isoFromParts', () => {
    const parts = partsFromIso('2024-02-29');
    expect(parts).not.toBeNull();
    expect(isoFromParts(parts!.year, parts!.month, parts!.day)).toBe('2024-02-29');
  });

  // The reason the function does more than run a regex: `new Date(2025, 1, 30)`
  // rolls silently to 2 March, so only comparing the parts back can tell.
  it.each(['2025-02-30', '2025-13-01', '2025-00-10', '2025-04-31'])(
    'rejects %s, which matches the shape but is not a day',
    (iso) => {
      expect(partsFromIso(iso)).toBeNull();
    },
  );

  it.each(['', '2025-10-8', '25-10-08', '2025/10/08', 'not a date', '2025-10-08T00:00:00Z'])(
    'rejects %p on shape alone',
    (iso) => {
      expect(partsFromIso(iso)).toBeNull();
    },
  );

  it('accepts 29 February in a leap year and rejects it otherwise', () => {
    expect(partsFromIso('2024-02-29')).not.toBeNull();
    expect(partsFromIso('2025-02-29')).toBeNull();
  });
});

describe('dateFromIso', () => {
  // The other half of the header's warning: `new Date('2025-10-08')` is UTC
  // midnight, so getDate() answers 7 anywhere behind UTC. Building from parts is
  // what keeps the day intact, and New York is where the naive version breaks.
  it('builds a local midnight, so the day survives a zone behind UTC', () => {
    inZone('America/New_York', () => {
      const date = dateFromIso('2025-10-08');

      expect(date).not.toBeNull();
      expect(date!.getFullYear()).toBe(2025);
      expect(date!.getMonth()).toBe(9);
      expect(date!.getDate()).toBe(8);
      expect(date!.getHours()).toBe(0);
    });
  });

  it('is null for a string that is not a calendar date', () => {
    expect(dateFromIso('2025-02-30')).toBeNull();
  });
});
