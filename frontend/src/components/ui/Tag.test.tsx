import { render, screen } from '@testing-library/react';

import { TAG_TONES, Tag, type TagTone } from './Tag';

// next/jest maps every .css import to an empty object, so jsdom never receives
// a stylesheet and no test here can assert a rendered colour or size. These
// assert the class names instead; that the classes generate real CSS is proved
// separately in components/utilities.test.ts.

const TONES = Object.keys(TAG_TONES) as TagTone[];

describe('Tag', () => {
  it('exposes exactly the five designed tones', () => {
    // Guards the it.each blocks below: dropping a tone would otherwise shrink
    // them to four silent cases and still pass.
    expect(TONES).toEqual(['neutral', 'green', 'amber', 'red', 'indigo']);
  });

  it.each(TONES)('%s carries its own text, not just its colour', (tone) => {
    // This is the accessibility criterion turned into an assertion: status is
    // never communicated by colour alone.
    render(<Tag tone={tone} label="On track" />);

    expect(screen.getByText('On track')).toBeInTheDocument();
  });

  it.each(TONES)('%s applies its designed pill and dot fills', (tone) => {
    render(<Tag tone={tone} label="On track" />);

    // The label is a bare text node on the pill, so getByText returns the pill
    // itself rather than an inner wrapper.
    const pill = screen.getByText('On track');
    expect(pill).toHaveClass(...TAG_TONES[tone].pill.split(' '));
    expect(pill.firstElementChild).toHaveClass(TAG_TONES[tone].dot);
  });

  it('defaults to the neutral tone', () => {
    render(<Tag label="Label" />);

    expect(screen.getByText('Label')).toHaveClass(...TAG_TONES.neutral.pill.split(' '));
  });

  it('shows the dot by default and hides it on request', () => {
    const { rerender } = render(<Tag label="Over" tone="red" />);
    expect(screen.getByText('Over').firstElementChild).not.toBeNull();

    rerender(<Tag label="Over" tone="red" dot={false} />);
    expect(screen.getByText('Over').firstElementChild).toBeNull();
  });

  it('hides the dot from assistive technology', () => {
    render(<Tag label="Near" tone="amber" />);

    expect(screen.getByText('Near').firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('is not a live region', () => {
    // Deliberate: the Figma name "Tag / Status" invites role="status", which is
    // an aria-live region. Every chip on the dashboard and all eight category
    // cards would then announce on mount. This test is here so that change
    // fails rather than ships.
    render(<Tag label="On track" tone="green" />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
