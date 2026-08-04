import { Body, Controller, Get, HttpStatus, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionPrincipal } from '../auth/session.service';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

/**
 * The Settings page and the sidebar footer, which read the same six fields.
 *
 * The resource is always the caller's own - there is no `/profile/{id}` and no
 * id anywhere in these signatures - so cross-user access is not something a
 * guard has to police here. No `@UseGuards` and no throttler, like the
 * transaction routes: `SessionGuard` is global (see AppModule), and these are
 * authenticated reads and writes of the caller's own row.
 *
 * Neither operation documents a 404. A verified session implies a profile row,
 * so its absence is a broken invariant answered by the generic 500 rather than a
 * state a client could do anything about.
 */
@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  @ApiOperation({
    summary: 'The signed-in person and their preferences.',
    description:
      '`email` comes from the central directory, everything else from your own database. `monthlyBudget` is in major units (2000.50, not 200050) and `monthStartDay` is the day of the month your budgeting period starts on.',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED)
  get(@CurrentUser() user: SessionPrincipal): Promise<ProfileResponseDto> {
    return this.profile.get(user.userId, user.email);
  }

  @Patch()
  @ApiOperation({
    summary: 'Change your details or preferences.',
    description:
      'Send only the fields to change: an absent field is left alone, and no field accepts null - every one of them is required in storage. An empty body is a **400**. `monthlyBudget` is in major units. Changing `email` changes where future login links are sent; links already in flight to the old address keep working, and your current session is unaffected. **409** means the address belongs to another account.',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.CONFLICT,
  )
  update(
    @CurrentUser() user: SessionPrincipal,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.profile.update(user.userId, user.email, dto);
  }
}
