// Calendar dates, in the one form the backend stores: `YYYY-MM-DD`.
//
// This module exists because a calendar date is **a day, not an instant**, and every
// bug in this area comes from treating it as the second. `backend/src/database/user/
// schema.ts` stores `transactions.date` as text for exactly that reason, and
// `CreateTransactionDto` documents that the string is stored verbatim, so the
// frontend's whole job is to produce and consume the string without ever letting a
// `Date` decide what day it means.
//
// **Nothing here touches `Intl` or UTC**, which is the difference between this file
// and `lib/format.ts`. That one is display formatting and hard-codes `en-US`, with a
// note that the locale follows the stored currency when there is one; a calendar date
// must never follow a locale, because `YYYY-MM-DD` is a wire format rather than
// something a reader sees. `lib/format.ts` owns the human-readable form
// (`formatIsoDate`) and imports `dateFromIso` from here to build it safely.
//
// The trap this file exists to prevent, in both directions:
//
//   new Date().toISOString().slice(0, 10)
//
// At 20:00 on 8 October in UTC-5 that answers the 9th; at 00:30 on 9 October in UTC+2
// it answers the 8th. So it is wrong for roughly a tenth of every day, in a way no
// developer in UTC will ever see and every user west or east of it will.
//
// And in the other direction, `new Date('2025-10-08')` parses as UTC **midnight** per
// the ECMAScript date-only grammar, so `getDate()` on it answers 7 anywhere behind
// UTC. That is why `dateFromIso` builds from parts and `formatIsoDate` goes through
// it rather than through the string.

/** `YYYY-MM-DD` and nothing else. Shape only; `partsFromIso` also checks the day is real. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Pads a month or day to the two digits the format requires. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The `YYYY-MM-DD` string for a year, a 1-12 month and a day.
 *
 * **`month` is 1-12, not 0-11.** Every function in this module and in
 * `lib/calendar.ts` uses the human numbering, and the conversion to JavaScript's
 * 0-11 happens only where a `Date` is actually constructed. A module that mixed the
 * two conventions would be one where every call site is a coin flip.
 */
export function isoFromParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

/**
 * The year, 1-12 month and day a `YYYY-MM-DD` string stands for, or `null`.
 *
 * Total rather than throwing, the same call `app/setup/draft.ts`'s `parseDraft`
 * makes: the value reaches this from component state and from props, and a throw in
 * the read would take the whole modal down rather than the one field.
 *
 * **The round-trip check is what rejects `2025-02-30`**, which the regex cannot know
 * is not a day. `new Date(2025, 1, 30)` silently rolls forward to 2 March, so
 * comparing the constructed date's own parts back against the input is the only way
 * to tell a real day from a rolled-over one. This is the same thing
 * `@IsDateString({ strict: true })` does on the backend DTO, and it is here for the
 * same reason rather than as a mirror of it.
 */
export function partsFromIso(iso: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Local constructor, never `new Date(iso)`: see the header note on UTC midnight.
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return { year, month, day };
}

/**
 * A local `Date` at midnight on the day a `YYYY-MM-DD` string names, or `null`.
 *
 * For formatting and for calendar arithmetic only. It is deliberately **not** a way
 * back to an instant to send anywhere: what crosses the wire is always the string.
 */
export function dateFromIso(iso: string): Date | null {
  const parts = partsFromIso(iso);
  return parts === null ? null : new Date(parts.year, parts.month - 1, parts.day);
}

/**
 * Today's calendar date where the user is, as `YYYY-MM-DD`.
 *
 * Local getters, so the answer is the day the user would name if you asked them. See
 * the header for why `toISOString()` is not an option, and note that
 * `Intl.DateTimeFormat('en-CA')` is not either: it happens to emit this format today,
 * but that is unspecified locale data an ICU update can change, and every other
 * `Intl` formatter in this repo is pinned to `en-US`, whose short date is `10/8/2025`.
 *
 * `now` is a parameter rather than a bare clock read so a suite can pin a moment
 * without faking timers - the same call `backend/src/common/month-window.ts` makes
 * about `today`, and for the same reason: it is what lets the boundary cases be
 * tested at all.
 */
export function todayIsoDate(now: Date = new Date()): string {
  return isoFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
