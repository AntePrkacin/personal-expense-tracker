import { Controller, Get, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { CategoryTemplatesResponseDto } from './dto/category-templates-response.dto';
import { PaletteResponseDto } from './dto/palette-response.dto';
import { TemplatesService } from './templates.service';

/**
 * The admin-managed template data: what onboarding offers, and what a category
 * picker may offer.
 *
 * **Two routes with different guards, and the split is not an oversight.**
 * Onboarding step 2 runs before an account exists, so its read cannot be
 * guarded; the picker is inside the signed-in app, so its read is. They also
 * answer different questions - one is "which categories are offered", the other
 * "which colours and icons exist" - so folding them into one response would make
 * the public route publish strictly more than it needs to.
 *
 * The write side is deliberately absent. There is no role or permission concept
 * anywhere in this app - central `users` holds an id, an email and a database
 * pointer, and `SessionGuard` is the only guard - so `users.role`, a
 * `SuperAdminGuard` and the admin UI are their own later ticket. This is the
 * read path that panel will eventually write to.
 */
@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /**
   * **The fifth `@Public()` route.** No throttler, matching the hello route and
   * unlike the three auth routes: `ThrottlerModule` is configured inside
   * `AuthModule` and `ThrottlerGuard` sits on `AuthController` alone, so there
   * is nothing here to skip and nothing to mis-skip. Worth stating rather than
   * leaving to be discovered, since a bare `@SkipThrottle()` means
   * `{ default: true }` and would silently skip nothing anyway.
   *
   * It reads no request state at all and returns the same bytes to everybody,
   * so it leaks nothing and enumerates nothing.
   */
  @Get('categories')
  @Public()
  @ApiOperation({
    summary: 'The starter categories onboarding offers.',
    description:
      'Public, because onboarding step 2 runs before an account exists. Send the `id`s of the picked entries as `RegisterDto.categories`; each picked template becomes one of the account’s categories at verification, carrying this `name`, `color`, `icon` and `description` (as the category’s `note`). The order is the one to render.',
  })
  @ApiOkResponse({ type: CategoryTemplatesResponseDto })
  categories(): Promise<CategoryTemplatesResponseDto> {
    return this.templates.categories();
  }

  @Get('palette')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The colours and icons a category may be given.',
    description:
      'What the create and edit category picker offers, with the label to show for each. This is what an admin currently has **enabled**, which can be a strict subset of what `POST /api/categories` accepts - a category already carrying a since-disabled colour keeps working.',
  })
  @ApiOkResponse({ type: PaletteResponseDto })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED)
  palette(): Promise<PaletteResponseDto> {
    return this.templates.palette();
  }
}
