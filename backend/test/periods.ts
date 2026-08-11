import {
  mostRecentAnchor,
  periodFor,
  previousPeriod,
  type Period,
} from './../src/common/period-rules';

/**
 * The current and previous periods of a freshly registered account.
 *
 * Three e2e suites need these bounds to assert what a period-scoped read returns,
 * and until PET-72 each derived them with `monthWindow(1, today)` from
 * `month-window.ts`. That function is gone: a period is the output of a walk over
 * `period_rules` now, so the suites have to resolve one the same way the app does
 * rather than reimplementing month arithmetic beside it.
 *
 * **Registration leaves `monthStartDay` at its default of 1**, so provisioning
 * anchors the seed rule to the 1st of the current month and every period is a
 * calendar month. That is what makes this helper honest for these suites and wrong
 * for any account that changed its pay schedule - such a suite should read
 * `GET /api/periods` instead, which is what a client does.
 */
export function calendarMonthPeriods(today: string): {
  current: Period;
  previous: Period;
} {
  const rules = [
    {
      effectiveFrom: mostRecentAnchor(1, today),
      monthStartDay: 1,
      transitionStart: null,
    },
  ];

  const current = periodFor(rules, today);

  return { current, previous: previousPeriod(rules, current) };
}
