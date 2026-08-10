import { ApiProperty } from '@nestjs/swagger';
import { PeriodSummaryDto } from '../../periods/dto/period-response.dto';
import { CategoryResponseDto } from './category-response.dto';

/**
 * Caps against the monthly budget, for the header of the Categories screen.
 *
 * **Period-scoped as of PET-72, and this comment used to say the opposite.** It
 * read "time-independent, unlike everything else on that screen: caps are monthly
 * by definition, so no period enters into this and it reads the same on the 1st
 * as on the 28th". That was true while a cap and a budget were each one current
 * column. Both are effective-dated history now, so this summary answers for the
 * period being reported - reading last December against today's budget and
 * today's caps is exactly the retroactive rewriting the ticket removed. It still
 * reads the same on the 1st as on the 28th *of one period*, which is the part of
 * the old claim that survives.
 */
export class AllocationResponseDto {
  @ApiProperty({
    description:
      'Major units. The budget in force for the period being reported, not necessarily the one set today.',
  })
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

  @ApiProperty({
    type: PeriodSummaryDto,
    description:
      'Which period every figure above is for - the current one unless `?period=` asked for another. Print `label` above the screen rather than deriving a month name from `start`: a period is not always a calendar month.',
  })
  period!: PeriodSummaryDto;

  @ApiProperty({ type: AllocationResponseDto })
  allocation!: AllocationResponseDto;
}
