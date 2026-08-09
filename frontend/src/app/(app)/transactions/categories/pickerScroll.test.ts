import { centreChosenRow } from './pickerScroll';

// jsdom runs no layout, so every `getBoundingClientRect()` is zero and the real outcome is a browser
// check. What is testable is the **arithmetic**, against geometry stubbed by hand - which is worth
// pinning, because the formula is the kind that looks right at a glance and is off by half a row.
//
// The same split `jest.setup.ts` records for charts: counts, roles and text in a suite, geometry in a
// browser.

/**
 * A scroll container of `height` with one chosen row of `rowHeight` sitting `rowTop` below its top
 * edge, already scrolled to `scrollTop`.
 *
 * Rects are viewport-relative in the real thing, so the container is placed at an arbitrary non-zero
 * `y` - if the formula ever forgets to subtract the container's own offset, a container at 0 would hide
 * it and this would pass.
 */
function container({
  height,
  rowTop,
  rowHeight,
  scrollTop = 0,
  y = 200,
}: {
  height: number;
  rowTop: number;
  rowHeight: number;
  scrollTop?: number;
  y?: number;
}): HTMLElement {
  const chosen = document.createElement('button');
  chosen.setAttribute('aria-current', 'true');
  chosen.getBoundingClientRect = () => ({ top: y + rowTop, height: rowHeight }) as DOMRect;

  const box = document.createElement('div');
  box.append(chosen);
  box.scrollTop = scrollTop;
  box.getBoundingClientRect = () => ({ top: y, height }) as DOMRect;

  return box;
}

describe('centreChosenRow', () => {
  it('centres a row that is below the fold', () => {
    // A 200px box, the row 300px down and 40px tall: its middle is at 320, the box's at 100, so the
    // box has to scroll 220 to line them up.
    const box = container({ height: 200, rowTop: 300, rowHeight: 40 });

    centreChosenRow(box);

    expect(box.scrollTop).toBe(220);
  });

  it('adds to whatever the container was already scrolled to, rather than replacing it', () => {
    // The rects are viewport-relative, so they already reflect the current scroll - which is why this
    // is `+=`. Replacing would send the container to the wrong place on every open but the first.
    const box = container({ height: 200, rowTop: 300, rowHeight: 40, scrollTop: 500 });

    centreChosenRow(box);

    expect(box.scrollTop).toBe(720);
  });

  it('leaves a row that is already centred alone', () => {
    // Row middle at 100 in a 200px box is already the centre, so the delta is zero.
    const box = container({ height: 200, rowTop: 80, rowHeight: 40 });

    centreChosenRow(box);

    expect(box.scrollTop).toBe(0);
  });

  it('does nothing when no row is marked, which is the failed-palette case', () => {
    const box = document.createElement('div');
    box.scrollTop = 40;

    centreChosenRow(box);

    expect(box.scrollTop).toBe(40);
  });

  it('does nothing for a container that has not mounted', () => {
    expect(() => centreChosenRow(null)).not.toThrow();
  });
});
