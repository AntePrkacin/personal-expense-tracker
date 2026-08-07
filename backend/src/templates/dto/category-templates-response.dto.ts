import { ApiProperty } from '@nestjs/swagger';
import {
  COLOUR_TOKENS,
  ICON_NAMES,
} from '../../database/central/template-tokens';

/**
 * One default category onboarding may offer.
 *
 * The colour and icon are **resolved** to their tokens rather than returned as
 * template ids: a caller draws a chip, and a second round trip to turn two ids
 * into two strings would buy nothing. The ids stay server-side, where the admin
 * panel will eventually edit them.
 */
export class CategoryTemplateDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'What `RegisterDto.categories` takes. Not a category id - the account does not exist yet.',
  })
  id!: string;

  @ApiProperty({
    example: 'Dining out',
    description:
      'Sentence case: first letter capital, everything else lower. Admin-authored, so this is a plain string rather than an enum.',
  })
  name!: string;

  @ApiProperty({
    enum: COLOUR_TOKENS,
    example: 'secondary',
    description:
      'A daisyUI semantic colour token, which is what `categories.color` stores. Not a hex: `primary` is valued differently per theme, so several of these have no single hex value.',
  })
  color!: string;

  @ApiProperty({
    enum: ICON_NAMES,
    example: 'utensils',
    description: 'A lucide icon name, in lucide’s own kebab-case.',
  })
  icon!: string;

  @ApiProperty({
    example: 'Restaurants, coffee shops, takeout, delivery, and fast food.',
    description:
      'Copied into the user’s own `note` when the category is seeded, after which it is theirs. Editing the template later does not reach back into existing accounts.',
  })
  description!: string;
}

export class CategoryTemplatesResponseDto {
  @ApiProperty({
    type: [CategoryTemplateDto],
    description:
      'The enabled category templates, in the order onboarding draws its chips. The order is part of the contract: render them as given rather than sorting.',
  })
  categories!: CategoryTemplateDto[];
}
