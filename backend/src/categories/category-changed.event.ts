/**
 * Emitted after a category is created, edited, deleted, or has its caps set in
 * bulk.
 *
 * **All four writes emit, and that is the point rather than thoroughness.**
 * `docs/TODO.md` recorded that a cap change could leave the insight set stale -
 * the over-cap rule reads caps, so raising one can make a `warning` card false -
 * and the reason nothing emitted was that `PATCH /categories/{id}` did not, so
 * emitting only from the bulk write would have made the same user action behave
 * differently depending on which modal performed it. PET-70 already made that
 * argument for not starting; PET-73 makes it for finishing.
 *
 * **No debounce is owed here**, which reverses what that TODO entry assumed. Its
 * objection was that "a rule-based run per cap change is cheap, and an LLM run
 * per cap change is not" - and no LLM is bound: `INSIGHT_GENERATOR` is still
 * `RuleBasedInsightGenerator`, and PET-73's chat is a separate module that
 * generates nothing. The bulk cap write is also one statement per modal save,
 * not one per keystroke.
 *
 * **Why an event rather than a call**, exactly as for `TRANSACTION_CHANGED`:
 * `InsightsModule` imports `CategoriesModule` for the generator's composition
 * surface, so a call back would close the loop into a circular module
 * dependency. The write path never learns that insights exist.
 */
export const CATEGORY_CHANGED = 'category.changed';

/** The payload: whose categories moved, and which write moved them. */
export interface CategoryChangedEvent {
  userId: string;
  reason: 'created' | 'updated' | 'caps-set' | 'deleted';
}
