import type { AssistantMessage } from '@/lib/assistant';
import type { SendMessageFailureReason } from '@/lib/sendAssistantMessage';

// The assistant chat's pure parts: the copy per failure, the message cap, and the optimistic
// message factory. React-free, so their rules are testable with literals - the split
// `(app)/transactionForm.ts` and `(app)/settings/settingsForm.ts` both keep.

/**
 * The longest message the composer accepts, restated from `SendMessageDto`'s `@MaxLength`.
 *
 * **A literal rather than a value read from the contract**, because `maxLength` reaches no
 * generated type - the same reason `CategoryPicker` restates `RegisterDto`'s `@ArrayMaxSize` and
 * `AllocateBudgetModal` restates `MAX_CAP_ROWS`. Without it the 400 arrives after a round trip and
 * says nothing the user can act on.
 */
export const MAX_MESSAGE_CHARS = 2000;

/**
 * One line per reported reason, and every one is invented copy joining what A29 owes a designer.
 *
 * The rules each line follows are `lib/sendAssistantMessage.ts`'s, and two of them are the whole
 * reason the taxonomy has seven arms rather than one. **`rateLimited` says wait, not retry** -
 * retrying is exactly what will not work. **`unavailable` must not blame the message**, because
 * nothing the user does fixes an unset key. And **`timedOut` invites the identical question
 * again**, which is why it cannot fold into `failed`.
 */
export const FAILURE_COPY: Record<SendMessageFailureReason, string> = {
  invalid: 'That message could not be sent. Try shortening it, or rephrasing the question.',
  unauthenticated: 'Your session has ended. Sign in again to pick this conversation back up.',
  missingSession:
    'That conversation is no longer available. Your question is still here - send it to start a new one.',
  rateLimited: "You've asked a lot in a short time. Wait a minute or two, then send it again.",
  unavailable:
    'The assistant is switched off on this deployment. Nothing is wrong with your question.',
  timedOut: 'The assistant took too long to answer. Sending the same question again usually works.',
  failed: 'The assistant could not answer just now. Try again in a moment.',
};

/**
 * The user's message, as it appears on screen before the server has stored it.
 *
 * **Optimistic and removed again on any failure**, which is not fussiness: the backend persists
 * nothing unless the reply arrives, so leaving the question on screen asserts a stored turn that
 * does not exist, and a reload would make it vanish. It is the same class of dishonesty the
 * transactions no-results copy and the insight teaser's third state each paid for separately.
 *
 * The id is a local marker rather than a uuid, because nothing addresses it: it exists only as a
 * React key until the server's real message replaces it.
 */
export const OPTIMISTIC_ID = 'optimistic-user-message';

export function optimisticMessage(content: string, createdAt: string): AssistantMessage {
  return { id: OPTIMISTIC_ID, role: 'user', content, createdAt };
}

/**
 * How the truncation notice reads, when the account has more transactions than fit one prompt.
 *
 * **The UI states it as well as the model being told**, because a fact the model is told should
 * also be a fact the screen can say - or the only witness to it is a sentence the model may or may
 * not have produced. Unreachable on every account this project has, since the ceiling is 3,000 and
 * the showcase account holds 2,249; its coverage is the backend spec's.
 */
export function truncationNotice(truncation: {
  included: number;
  total: number;
  oldestIncludedDate: string;
}): string {
  return `Answered from your ${truncation.included} most recent transactions of ${truncation.total}, back to ${truncation.oldestIncludedDate}.`;
}
