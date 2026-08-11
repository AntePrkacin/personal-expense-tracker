import { ApiProperty } from '@nestjs/swagger';
import { AssistantMessageDto } from './assistant-message-response.dto';

/**
 * What was left out of the prompt, when the ceiling bit.
 *
 * **Reported to the screen as well as to the model.** A fact the model is told
 * should also be a fact the UI can state, or the only witness to it is a sentence
 * the model may or may not have produced.
 */
export class AssistantTruncationDto {
  @ApiProperty({
    example: 3000,
    description: 'How many transactions were sent.',
  })
  included!: number;

  @ApiProperty({ example: 4210, description: 'How many the account has.' })
  total!: number;

  @ApiProperty({
    example: '2024-02-09',
    description:
      'The oldest date the assistant could see. Anything earlier is missing from its answer.',
  })
  oldestIncludedDate!: string;
}

/**
 * One completed turn: the question as stored, the answer, and the session both
 * belong to.
 *
 * The session id comes back whether or not the request carried one, so a first
 * message and a continuation are the same call to the client. `title` comes back
 * for the same reason - it is derived from the first message and the History list
 * needs it without a second read.
 */
export class SendMessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiProperty({
    example: 'How much did I spend on groceries?',
    description:
      'Derived from the first message of the session and never rewritten.',
  })
  title!: string;

  @ApiProperty({ type: AssistantMessageDto })
  message!: AssistantMessageDto;

  @ApiProperty({ type: AssistantMessageDto })
  reply!: AssistantMessageDto;

  @ApiProperty({
    type: AssistantTruncationDto,
    nullable: true,
    description:
      'Null whenever the whole history fitted, which is every account this project has.',
  })
  truncation!: AssistantTruncationDto | null;
}
