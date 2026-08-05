import type { InsightTone } from './dto/insight-set-response.dto';

/** One generated card before it is persisted: pure rendered content. */
export interface GeneratedCard {
  tone: InsightTone;
  title: string;
  body: string;
}

/**
 * A full generated set: the summary banner plus its cards, all rendered prose.
 *
 * This is what an `InsightGenerator` produces and `InsightsService` persists
 * verbatim (PET-41 stores rendered strings). `null` from a generator means there
 * was nothing to generate - an account with no transactions - and no set is
 * written (AC7).
 */
export interface GeneratedSet {
  monthLabel: string;
  summary: { headline: string; body: string };
  cards: GeneratedCard[];
}

/**
 * The seam between "how insights are produced" and "how they are stored".
 *
 * `RuleBasedInsightGenerator` is the only implementation today: deterministic
 * detectors filling templated copy. It is bound behind this interface so a later
 * ticket can drop in an `LlmInsightGenerator` - a one-line provider change in
 * `InsightsModule` - without touching storage, the read, the `POST` trigger or
 * the frontend. That is the "rules now, LLM-ready seam" the plan settled on.
 */
export interface InsightGenerator {
  generate(userId: string): Promise<GeneratedSet | null>;
}

/** DI token, because an interface erases and cannot be injected by type. */
export const INSIGHT_GENERATOR = Symbol('INSIGHT_GENERATOR');
