import { ApiProperty } from '@nestjs/swagger';
import {
  COLOUR_TOKENS,
  ICON_NAMES,
} from '../../database/central/template-tokens';

/**
 * One colour the create and edit category picker offers.
 *
 * The label is the whole reason this endpoint exists rather than the frontend
 * deriving a word from the token: "Accent Content" is not a colour anybody
 * picks, and the word is the admin's to choose.
 */
export class PaletteColourDto {
  @ApiProperty({
    enum: COLOUR_TOKENS,
    example: 'accent-content',
    description: 'What to send as a category’s `color`.',
  })
  token!: string;

  @ApiProperty({ example: 'Pine', description: 'What to show beside it.' })
  label!: string;
}

/** One icon the picker offers. */
export class PaletteIconDto {
  @ApiProperty({
    enum: ICON_NAMES,
    example: 'paw-print',
    description: 'What to send as a category’s `icon`.',
  })
  name!: string;

  @ApiProperty({ example: 'Paw' })
  label!: string;
}

/**
 * What a category picker may offer, as the admin currently has it configured.
 *
 * **Enabled rows only, and that is presentation rather than validation.** A
 * category already carrying a since-disabled colour keeps rendering, because
 * `@IsIn` checks the code-side allowlist and never this flag - so this list can
 * be a strict subset of what the API accepts, deliberately.
 */
export class PaletteResponseDto {
  @ApiProperty({ type: [PaletteColourDto], description: 'In admin order.' })
  colors!: PaletteColourDto[];

  @ApiProperty({ type: [PaletteIconDto], description: 'In admin order.' })
  icons!: PaletteIconDto[];
}
