import { ApiProperty } from '@nestjs/swagger';
import { CategoryResponseDto } from './category-response.dto';

/**
 * Caps against the monthly budget, for the header of the Categories screen.
 *
 * Time-independent, unlike everything else on that screen: caps are monthly by
 * definition, so no period enters into this and it reads the same on the 1st as
 * on the 28th.
 */
export class AllocationResponseDto {
  @ApiProperty({ description: 'Major units, from your profile.' })
  monthlyBudget!: number;

  @ApiProperty({
    description:
      'Major units. The sum of every live category cap; uncapped categories contribute nothing, so this can sit well below the budget for someone who caps little.',
  })
  allocated!: number;

  @ApiProperty({
    description:
      'Major units, `monthlyBudget - allocated`. **Can be negative**: nothing prevents caps from exceeding the budget (A43), and the figure is returned unclamped so the excess is recoverable.',
  })
  unallocated!: number;
}

/**
 * The whole Categories screen in one response.
 *
 * The allocation summary ships here rather than behind its own endpoint because
 * frame 13 draws it as the header of the screen the cards are on - splitting it
 * out would charge the primary consumer a second round trip for two numbers
 * derived from rows this call already returned.
 */
export class CategoriesResponseDto {
  @ApiProperty({
    type: [CategoryResponseDto],
    description: 'Live categories, ordered by name.',
  })
  categories!: CategoryResponseDto[];

  @ApiProperty({ type: AllocationResponseDto })
  allocation!: AllocationResponseDto;
}
