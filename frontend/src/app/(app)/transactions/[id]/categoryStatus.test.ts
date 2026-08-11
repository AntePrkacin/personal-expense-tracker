import { barPercent, chipFor, displayPercent } from './categoryStatus';

describe('displayPercent', () => {
  it('floors rather than rounding', () => {
    // The whole reason this is not Math.round. `status` is decided on integer cents, so a
    // rounded 99.6 would print "100% used" beside a chip coloured for `near`.
    expect(displayPercent(99.6)).toBe(99);
    expect(displayPercent(79.4)).toBe(79);
  });

  it('leaves a whole percentage alone', () => {
    expect(displayPercent(100)).toBe(100);
  });

  it('prints an over-budget percentage in full', () => {
    // The chip says how far over; only the bar is clamped.
    expect(displayPercent(137.9)).toBe(137);
  });

  it('clamps at zero', () => {
    expect(displayPercent(-0.4)).toBe(0);
  });
});

describe('barPercent', () => {
  it('matches the printed percentage below the cap', () => {
    expect(barPercent(79.4)).toBe(79);
  });

  it('stops at 100 so an over-budget bar does not overflow its track', () => {
    expect(barPercent(137.9)).toBe(100);
  });

  it('is zero for a category with no spend', () => {
    expect(barPercent(0)).toBe(0);
  });
});

describe('chipFor', () => {
  it.each([
    ['on_track', 12.5, 'badge badge-sm badge-success', '12% used'],
    ['near', 79.4, 'badge badge-sm badge-warning', '79% used'],
    ['full', 100, 'badge badge-sm badge-orange', '100% used'],
    ['over', 137.9, 'badge badge-sm badge-error', '137% used'],
  ] as const)('maps %s to its own chip', (status, percentUsed, className, label) => {
    // Semantic state, not the mock's hue: the frame's amber at 79% is `near`, and this pins
    // the mapping per key so a fifth status cannot silently inherit a fourth one's colour.
    expect(chipFor({ status, percentUsed })).toEqual({ className, label });
  });

  it('renders no chip at all for an uncapped category', () => {
    // The common case, not the edge - the preselected fallback category ships uncapped.
    expect(chipFor({ status: 'uncapped', percentUsed: null })).toBeNull();
  });

  it('renders no chip when percentUsed is null despite a capped status', () => {
    // The contract types `percentUsed` nullable independently of `status`, so a chip built
    // from the status alone could print "null% used".
    expect(chipFor({ status: 'near', percentUsed: null })).toBeNull();
  });

  it('keeps every class string complete, so Tailwind can scan them', () => {
    // frontend/CLAUDE.md's scanner rule: an interpolated `badge-${tone}` compiles to nothing
    // with no build error. Each value has to carry `badge` itself.
    for (const status of ['on_track', 'near', 'full', 'over'] as const) {
      expect(chipFor({ status, percentUsed: 50 })?.className).toMatch(/^badge /);
    }
  });
});
