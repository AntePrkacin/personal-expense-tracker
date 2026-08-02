import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogMailer } from './log.mailer';
import { MAILER, type Mailer } from './mailer';
import { MailPaceMailer } from './mailpace.mailer';

/**
 * Wires whichever mailer the environment allows.
 *
 * Choosing on `MAILPACE_API_TOKEN` alone is safe because env.validation.ts ties
 * it to `MAIL_FROM` with `.and()`: either both are set or neither is, so this
 * cannot select a transport that then fails on a missing sender.
 */
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Mailer => {
        if (config.get<string>('MAILPACE_API_TOKEN')) {
          return new MailPaceMailer(config);
        }
        new Logger(MailModule.name).log(
          'MAILPACE_API_TOKEN is not set; login links will be logged, not sent',
        );
        return new LogMailer();
      },
    },
  ],
  exports: [MAILER],
})
export class MailModule {}
