// The one email rule the frontend applies, shared by the two screens that collect
// an address: 22 Register (REG-2) and 23 Log in (LOG-2).
//
// It started in app/setup/draft.ts, beside the onboarding draft's other validity
// rules, which was right while Register was the only screen with an email field.
// `/login` is deliberately outside `/setup` - LOG-5 makes Welcome its only entry
// and it holds no draft - so importing the onboarding module from it would couple
// the returning-user flow to onboarding for one regular expression. It moved here
// rather than being re-exported from there, so there is exactly one import path.

/**
 * One `@`, a dot in the domain, no whitespace.
 *
 * Deliberately looser than the DTOs' `@IsEmail()`, which is validator.js and is
 * the authority. Matching it would mean either a validation dependency for one
 * field or a copy of its expression that rots silently, so the addresses this
 * accepts and the backend rejects land on a form-level message instead of the
 * inline one - the trade PET-11's plan records.
 *
 * Trims before testing, because both forms hold what was typed and trim only at
 * the boundary where the request body is built.
 */
export function isEmailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
