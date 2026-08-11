import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { MAX_MESSAGE_CHARS } from '../assistant.constants';

/**
 * One question to the assistant, optionally continuing a session.
 *
 * **One POST rather than `POST /sessions` followed by `POST
 * /sessions/:id/messages`.** The user's action is sending a message, not
 * creating a session, and two round trips make a first message able to leave a
 * session with no turn in it.
 */
export class SendMessageDto {
  @ApiProperty({
    example: 'How much did I spend on groceries last month?',
    minLength: 1,
    maxLength: MAX_MESSAGE_CHARS,
    description:
      'The question. The cap exists so a pasted novel cannot be what blows the model context; the composer restates it client-side, because `maxLength` reaches no generated type and the resulting 400 would otherwise produce advice the user cannot act on.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_MESSAGE_CHARS)
  message!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The session to continue. Omit it to start one; the response carries the id that was created. An id naming no live session of yours is a **404**, unambiguously - this body references exactly one resource by id.',
  })
  // `@ValidateIf`, never `@IsOptional()`, which skips validation for `null` as
  // well as `undefined` - the trap `UpdateTransactionDto` documents. Here that
  // would let `{"sessionId": null}` through to a lookup on null.
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  sessionId?: string;
}
