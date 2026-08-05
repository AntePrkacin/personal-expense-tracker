import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionPrincipal } from '../auth/session.service';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { CategoriesService } from './categories.service';
import { CategoriesResponseDto } from './dto/categories-response.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * The Categories screen: the cards, their month progress and the allocation
 * header, plus create, edit and delete.
 *
 * Every route is the caller's own data - the id in a path is looked up in the
 * caller's own database, so another account's id is simply not there and the
 * ordinary 404 covers it. No `@UseGuards` and no throttler, like the profile and
 * transaction routes: `SessionGuard` is global (see AppModule).
 *
 * There is no `GET /categories/{id}`. Nothing in the design reads one category
 * on its own; the transaction detail's category context is PET-28's, served
 * from that transaction's own response.
 */
@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Your categories with this period’s progress, and the allocation summary.',
    description:
      'One call serves the whole screen. Money is in major units. `spent` and `transactionCount` cover the current budgeting period, which starts on your profile’s `monthStartDay` rather than the 1st. An uncapped category reports `status: "uncapped"` with a null cap, percent, remaining and over - a cap is optional, so this is ordinary rather than exceptional. `allocation.unallocated` can be negative when caps exceed the budget.',
  })
  @ApiOkResponse({ type: CategoriesResponseDto })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED)
  list(@CurrentUser() user: SessionPrincipal): Promise<CategoriesResponseDto> {
    return this.categories.list(user.userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a category.',
    description:
      '`monthlyCap` is optional: omit it for a category with no limit. A cap of **0 or less is a 400** - it means "spend nothing here", which is not the same as no limit and is almost always an empty field rather than an intent.',
  })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  create(
    @CurrentUser() user: SessionPrincipal,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categories.create(user.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change a category.',
    description:
      'Send only the fields to change. An absent field is left alone; `monthlyCap` and `note` also accept `null`, which clears them - clearing a cap makes the category uncapped. An empty body is a **400**. **409** means you tried to rename `Uncategorized`, whose name is fixed; its cap, color, icon and note are all editable.',
  })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  update(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categories.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a category, keeping its transactions.',
    description:
      'The transactions are **not** deleted: they move to `Uncategorized`, which is why that category exists. **409** means you tried to delete `Uncategorized` itself.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  remove(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.categories.remove(user.userId, id);
  }
}
