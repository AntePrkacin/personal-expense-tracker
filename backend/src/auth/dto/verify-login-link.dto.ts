import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * The token out of the emailed link, submitted in a POST body.
 *
 * In the body rather than the query string because the frontend's route handler
 * is what calls this, and a query parameter would put a live credential into
 * every backend access log. The email's own link still carries it in its query
 * string, which is unavoidable and documented.
 */
export class VerifyLoginLinkDto {
  /**
   * The raw token, exactly as it arrived in the link. 43 characters in practice
   * (256 bits, base64url); the bound is loose enough not to encode that here
   * while still keeping a megabyte body from ever reaching a hash function.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token!: string;
}
