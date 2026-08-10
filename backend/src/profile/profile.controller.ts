import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionPrincipal } from '../auth/session.service';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { ChangeScheduleDto } from './dto/change-schedule.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

/**
 * The Settings page and the sidebar footer, which read the same five fields.
 *
 * The resource is always the caller's own - there is no `/profile/{id}` and no
 * id anywhere in these signatures - so cross-user access is not something a
 * guard has to police here. No `@UseGuards` and no throttler, like the
 * transaction routes: `SessionGuard` is global (see AppModule), and these are
 * authenticated reads and writes of the caller's own row.
 *
 * **Three operations, and the split between the two writes is the point.** The
 * PATCH changes the account's own properties; the schedule POST changes something
 * that has a *date* attached, and the Settings form sends both when one Save
 * touches both kinds of field. The alternative - one PATCH taking every field -
 * is what shipped before PET-72, and it could not express "from when", so it
 * silently rewrote the budget of every period the account had ever had.
 *
 * No operation documents a 404. A verified session implies a profile row, so its
 * absence is a broken invariant answered by the generic 500 rather than a state a
 * client could do anything about.
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
      '`email` comes from the central directory, everything else from your own database. `monthlyBudget` is in major units (2000.50, not 200050) and `monthStartDay` is the day of the month your budgeting period starts on - your pay day. Both are the values **in force for the current period**, resolved from your budget and pay-schedule history rather than stored as single settings; change either through `POST /api/profile/schedule`, which asks from which paycheck the change applies.',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED)
  get(@CurrentUser() user: SessionPrincipal): Promise<ProfileResponseDto> {
    return this.profile.get(user.userId, user.email);
  }

  @Patch()
  @ApiOperation({
    summary: 'Change your name, email or currency.',
    description:
      'Send only the fields to change: an absent field is left alone, and no field accepts null - every one of them is required in storage. An empty body is a **400**. Changing `email` changes where future login links are sent; links already in flight to the old address keep working, and your current session is unaffected. **409** means the address belongs to another account. **`monthlyBudget` and `monthStartDay` are deliberately not accepted here** - both apply from a date, so they go through `POST /api/profile/schedule`; sending either is a 400.',
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

  // A literal sub-path under a controller whose other routes are collection-level
  // and carry no `:id`, so there is no route-ordering hazard here of the kind
  // `TransactionsController` documents.
  @Post('schedule')
  // **200, not Nest's default 201 for a POST.** It appends rows, but it does not
  // create a resource a caller could then address: there is no
  // `/profile/schedule/{id}` and nothing to put in a `Location` header. What it
  // answers is the profile, exactly as `GET /api/profile` does. Without this the
  // runtime would answer 201 while `@ApiOkResponse` below published 200, and the
  // generated client would read the success arm off a status the server never
  // sends.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change your budget or pay day, from a given paycheck.',
    description:
      'Sets your monthly budget and pay day **from `firstPaycheckDate` onward**, leaving every earlier period exactly as it was. If the pay day changes, that paycheck opens a new period and the one before it is **stretched** to meet it - salaries are paid in arrears, so the old schedule’s last paycheck never arrives, and the stretched period keeps the **old** budget. If the pay day is unchanged this is a budget-only change and no period boundary moves. The date may be in the **past**, which re-shapes periods from then on, or in the **future**, which stretches the current period up to it. A **400** means `firstPaycheckDate` is not day `monthStartDay` of its month. Sending the identical body twice is safe: it converges rather than duplicating. Answers the whole profile, exactly as `GET /api/profile` does.',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  // No 409: nothing here can conflict with another account, and a repeat of the
  // same anchor converges rather than colliding.
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  changeSchedule(
    @CurrentUser() user: SessionPrincipal,
    @Body() dto: ChangeScheduleDto,
  ): Promise<ProfileResponseDto> {
    return this.profile.changeSchedule(user.userId, user.email, dto);
  }
}
