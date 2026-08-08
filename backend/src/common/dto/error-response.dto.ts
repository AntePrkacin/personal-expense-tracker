import { ApiProperty } from '@nestjs/swagger';

/**
 * The single error shape every failed request returns.
 *
 * `AllExceptionsFilter` builds this and types what it builds as this class, so
 * a field added to one is a compile error in the other. That link is the only
 * thing keeping the filter and the published spec honest - see the class
 * comment on `HealthResponseDto` for why this has to be a class in a `.dto.ts`
 * file rather than the interface it used to be.
 */
export class ErrorResponseDto {
  statusCode!: number;

  /** String for most errors; an array for class-validator's field messages. */
  @ApiProperty({
    // The one field the CLI plugin cannot derive: it reads plain types well
    // but flattens a union to nothing usable. Spelled out here because the
    // frontend genuinely has to handle both arms.
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message!: string | string[];

  error!: string;

  timestamp!: string;

  path!: string;
}
