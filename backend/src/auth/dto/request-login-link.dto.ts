import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email';

/**
 * Screen 23's single field (LOG-2), and the same request behind "Resend link"
 * on 24 (VER-2).
 */
export class RequestLoginLinkDto {
  // Normalized identically to RegisterDto's, or the two would disagree about
  // which rows are the same account.
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value) ?? value)
  @IsEmail()
  email!: string;
}
