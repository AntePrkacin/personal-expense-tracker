import {
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  buildPrompt,
  type AssistantHistoryMessage,
  type AssistantPromptContext,
} from './assistant-context.builder';
import { ASSISTANT_MODEL, ASSISTANT_TIMEOUT_MS } from './assistant.constants';

/**
 * The one call site that talks to Gemini for the assistant.
 *
 * Kept separate from `AssistantService` so a spec can mock `@google/genai`
 * wholesale and assert this file's own contract - what it sends, and how it
 * classifies a failure - without touching the database reads or the one write.
 * `ReceiptExtractionService` is the precedent and this follows it deliberately.
 *
 * **There is no response schema and no JSON response type**, which is the one
 * respect in which this differs from every other Gemini call in the repo: the
 * answer is prose. So there is no schema whose field descriptions double as
 * instruction - the whole instruction is the prompt string, which is
 * `assistant-context.builder.ts`'s.
 */
@Injectable()
export class AssistantCompletionService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Whether `GEMINI_API_KEY` is set. The key is optional and unpaired (see
   * `env.validation.ts`), so this is what lets `AssistantService` answer a
   * defined 503 **before it opens the user database**, exactly as
   * `ReceiptScanService.scan` does, and cost an unconfigured deployment no
   * wasted reads.
   */
  isConfigured(): boolean {
    return Boolean(this.config.get<string>('GEMINI_API_KEY'));
  }

  /**
   * One turn: the context as a system instruction, the prior conversation, and
   * the new question.
   *
   * **The abort chain's third hop ends here.** `signal` is the request's own,
   * derived from the client disconnecting, and it is combined with this
   * service's timeout through `AbortSignal.any` - so an abandoned turn stops
   * spending quota rather than running to completion with nobody listening.
   * Hops 1 and 2 are the composer's `AbortController` and the route handler
   * passing `request.signal` through; all three are needed and a cancel that
   * reaches only the first two looks identical on screen.
   * See `docs/explainers/cancelling-an-ai-request.md`.
   *
   * @throws ServiceUnavailableException if no key is configured. Callers should
   * check `isConfigured()` first; this is the defensive second check.
   * @throws GatewayTimeoutException if the call does not finish within
   * `ASSISTANT_TIMEOUT_MS`. A caller-side abort is **not** a 504 - it rethrows,
   * because the response is going nowhere and calling a deliberate cancel a
   * timeout would put a wrong line in the log.
   */
  async complete(
    context: AssistantPromptContext,
    history: readonly AssistantHistoryMessage[],
    message: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('The assistant is not configured.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const timeout = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      timeout.abort();
    }, ASSISTANT_TIMEOUT_MS);

    // Node is pinned to 26 and the engines floor is 22.12, well past where
    // `AbortSignal.any` landed. Without a caller signal this is the timeout
    // alone, which is what every spec and the e2e suite exercise.
    const abortSignal = signal
      ? AbortSignal.any([timeout.signal, signal])
      : timeout.signal;

    try {
      const response = await ai.models.generateContent({
        model: ASSISTANT_MODEL,
        contents: [
          ...history.map((entry) => ({
            role: entry.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: entry.content }],
          })),
          { role: 'user', parts: [{ text: message }] },
        ],
        config: {
          systemInstruction: buildPrompt(context),
          abortSignal,
        },
      });

      const text = response.text?.trim();
      if (!text) {
        // Unlike a receipt scan, there is no degraded answer worth returning:
        // an empty reply is not a real outcome the user can act on, and
        // storing one would put a blank bubble in a conversation forever.
        // A plain Error is the broken-invariant pattern `ProfileService` uses,
        // answered by the generic 500 - deliberately not one of the six
        // documented statuses, which `test/openapi.e2e-spec.ts` pins.
        throw new Error('The assistant returned an empty answer.');
      }

      return text;
    } catch (error) {
      // The SDK's own doc comment on `abortSignal` says the service call is
      // still billed, so this is the only way to tell "we gave up waiting"
      // from any other failure it throws.
      if (timedOut) {
        throw new GatewayTimeoutException('The assistant timed out.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
