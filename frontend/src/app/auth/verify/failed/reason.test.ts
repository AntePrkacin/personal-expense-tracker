import { parseReason, VERIFY_FAILURE_REASONS } from './reason';

// The value arrives in a query string, so it is typed by whoever holds the address bar
// and is interpolated straight into a heading. Same threat model `parseDraft` handles
// for sessionStorage and `readPendingEmail` for its cookie.

describe('parseReason', () => {
  it.each(VERIFY_FAILURE_REASONS)('passes %s through', (reason) => {
    expect(parseReason(reason)).toBe(reason);
  });

  it.each([
    ['an absent parameter', undefined],
    ['an empty string', ''],
    ['a reason that does not exist', 'expired'],
    ['a near miss', 'Invalid'],
    ['something hand-written', 'your account was deleted'],
  ])('falls back to failed for %s', (_label, value) => {
    expect(parseReason(value)).toBe('failed');
  });

  it('falls back to the copy that claims the least', () => {
    // Deliberately not `invalid`: telling a user their link is dead when the truth is
    // unknown would send them to request another one they may not need. "Something went
    // wrong on our end" is true whatever actually happened.
    expect(parseReason('nonsense')).toBe('failed');
  });

  it('covers every reason the handler can produce', () => {
    // The two files cannot drift, because `route.ts` types its own table against this
    // union - but the count is worth pinning so a fifth reason cannot be added here and
    // left without copy.
    expect(VERIFY_FAILURE_REASONS).toEqual(['invalid', 'superseded', 'busy', 'failed']);
  });
});
