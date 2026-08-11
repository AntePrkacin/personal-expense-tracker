import { ApiProperty } from '@nestjs/swagger';

/**
 * Who said it. A closed set constrained in TypeScript rather than in SQLite,
 * the convention `InsightState` and `CategoryStatus` already keep.
 */
export type AssistantRole = 'user' | 'assistant';

/**
 * One stored message.
 *
 * **Every message here is part of a completed turn.** Nothing is persisted
 * unless the model answered, so there is no status, no pending role and no
 * half-written exchange a client has to interpret - the deliberate contrast with
 * `insight_sets`, whose whole read is a lifecycle.
 */
export class AssistantMessageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['user', 'assistant'] })
  role!: AssistantRole;

  @ApiProperty({ example: 'You spent 312.40 EUR on Groceries in August 2026.' })
  content!: string;

  @ApiProperty({ type: String, description: 'ISO 8601.' })
  createdAt!: string;
}
