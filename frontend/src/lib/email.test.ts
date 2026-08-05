import { isEmailValid } from './email';

// Moved here with the rule itself, out of app/setup/draft.test.ts: the cases are
// unchanged, and they never depended on the draft - the function has always taken a
// plain string.
//
// No jsdom is needed, which is the point of the rule living in lib/ rather than in a
// component: every assertion below is over plain data.

describe('isEmailValid', () => {
  it.each([
    'marko@email.com',
    'marko.kovac@email.co.uk',
    'marko+tag@email.com',
    '  marko@email.com  ',
  ])('accepts %s', (email) => {
    expect(isEmailValid(email)).toBe(true);
  });

  it.each([
    ['an untouched field', ''],
    ['no at sign', 'marko.email.com'],
    ['nothing before the at', '@email.com'],
    ['nothing after the at', 'marko@'],
    ['no dot in the domain', 'marko@email'],
    ['two at signs', 'marko@@email.com'],
    ['an inner space', 'marko kovac@email.com'],
  ])('rejects %s', (_label, email) => {
    expect(isEmailValid(email)).toBe(false);
  });

  it('is looser than the backend and that is the known gap', () => {
    // A trailing dot is a valid-looking address this rule accepts and validator.js
    // rejects, so it reaches the backend and comes back a 400 rendered as the
    // form-level message. Pinned so the gap is a documented behaviour rather than a
    // surprise: closing it means a validation dependency or a copy of validator.js's
    // expression that rots silently.
    expect(isEmailValid('marko@email.com.')).toBe(true);
  });

  it('rejects a value no field could have produced', () => {
    // Not a duplicate of the cases above: this is the property lib/pendingEmail.ts
    // leans on when it validates a cookie value before interpolating it into screen
    // 24's copy. A hand-written cookie is the devtools equivalent of the stored
    // sessionStorage draft parseDraft already refuses to trust.
    expect(isEmailValid('not an address')).toBe(false);
    expect(isEmailValid('<script>alert(1)</script>')).toBe(false);
  });
});
