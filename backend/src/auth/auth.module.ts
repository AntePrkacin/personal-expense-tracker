import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginTokenService } from './login-token.service';

/** The passwordless access flow: register, and request a login link. */
@Module({
  imports: [MailModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService, LoginTokenService],
})
export class AuthModule {}
