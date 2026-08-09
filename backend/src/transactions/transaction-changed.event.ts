/**
 * Emitted after a transaction is created, updated or deleted.
 *
 * The write path's whole knowledge of insights, and deliberately none: it says
 * that this user's numbers moved, not what should happen next. `InsightsModule`
 * is the only listener today, and adding a second one needs no edit here.
 *
 * **Why an event rather than a call.** `InsightsModule` already imports
 * `TransactionsModule`, because `RuleBasedInsightGenerator` injects
 * `TransactionsService`. Having `TransactionsService` call `InsightsService`
 * closes that loop into a circular module dependency, which NestJS resolves only
 * with `forwardRef()` on both modules and on the constructor injection. The
 * emitter costs a first-party dependency and buys a seam with no cycle in it.
 */
export const TRANSACTION_CHANGED = 'transaction.changed';

/** The payload: whose numbers moved, and which write moved them. */
export interface TransactionChangedEvent {
  userId: string;
  reason: 'created' | 'updated' | 'deleted';
}
