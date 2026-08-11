import { ApiProperty } from '@nestjs/swagger';
import { AssistantMessageDto } from './assistant-message-response.dto';

/** One conversation, as the History list draws it. */
export class AssistantSessionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'How much did I spend on groceries?' })
  title!: string;

  @ApiProperty({
    type: String,
    description:
      'ISO 8601, when the last completed turn landed. The list orders on it.',
  })
  lastMessageAt!: string;

  @ApiProperty({ type: String, description: 'ISO 8601.' })
  createdAt!: string;
}

/**
 * Your conversations, newest activity first.
 *
 * **A wrapper object, not a bare array**, the shape every list read in this API
 * keeps: a top-level array has nowhere to put a field, so the first thing it
 * needs is a breaking change.
 */
export class AssistantSessionsResponseDto {
  @ApiProperty({ type: [AssistantSessionDto] })
  sessions!: AssistantSessionDto[];

  @ApiProperty({
    example: 3,
    description:
      'How many conversations there are. Equal to `sessions.length` while there is no pagination, and returned as its own field so a future page size cannot silently turn it into a page count - the reasoning `GET /transactions` already records for its own `total`.',
  })
  total!: number;
}

/**
 * How many conversations the account holds, and nothing else (PET-76).
 *
 * **This exists so a screen that wants only the number does not pull the list to
 * get it.** The tab bar over both assistant views draws a count on History, and
 * that bar renders on the Chat route too - where the whole list would otherwise
 * cross the wire, be parsed, and be discarded except for its length. PET-76 had
 * just made a bare `/insights` fetch nothing at all, so the alternative was
 * spending a full list read on one integer.
 *
 * **`total` rather than a bare number**, for the reason the wrapper above gives:
 * a top-level scalar has nowhere to put a second field, so the first thing it
 * needs is a breaking change. It is deliberately the **same field name** as the
 * one on `AssistantSessionsResponseDto`, because it is the same fact - a caller
 * that has either object reads `.total` and does not care which it holds.
 */
export class AssistantSessionCountResponseDto {
  @ApiProperty({
    example: 3,
    description:
      'How many live conversations there are. The same figure `GET /assistant/sessions` publishes as `total`, over the same predicate, without the rows.',
  })
  total!: number;
}

/** One conversation with its messages, for resuming it. */
export class AssistantConversationResponseDto extends AssistantSessionDto {
  @ApiProperty({
    type: [AssistantMessageDto],
    description: 'In render order, oldest first.',
  })
  messages!: AssistantMessageDto[];
}
