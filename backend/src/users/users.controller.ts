import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService, type UserResponse } from './users.service';

/**
 * Proof-of-stack endpoints, not the final API.
 *
 * The tech spec's surface is `register(...)` (carrying the onboarding category
 * selection), the magic-link flow, and a session-scoped `getProfile()`. These
 * two routes exist to exercise the two-database write and read path end to end
 * and are unauthenticated until the auth feature lands, which is expected to
 * reshape or replace them.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto): Promise<UserResponse> {
    return this.usersService.create(dto);
  }

  // No `version` option: ids are UUIDv7, and `version: '4'` would reject every
  // one of them.
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponse> {
    return this.usersService.findById(id);
  }
}
