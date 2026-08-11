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

/** One conversation with its messages, for resuming it. */
export class AssistantConversationResponseDto extends AssistantSessionDto {
  @ApiProperty({
    type: [AssistantMessageDto],
    description: 'In render order, oldest first.',
  })
  messages!: AssistantMessageDto[];
}
