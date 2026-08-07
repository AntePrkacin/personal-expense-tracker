import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ERROR_COPY, ErrorScreen } from './ErrorScreen';

// The screen rather than `error.tsx`, for the reason that file gives: a Next boundary is only
// reachable by throwing inside a real render tree, while this is an ordinary component. What
// the boundary itself adds is two lines of prop threading, which `npm run build` typechecks.

describe('the error screen', () => {
  it("says what happened in its own words rather than Next's default page", () => {
    render(<ErrorScreen reset={jest.fn()} />);

    expect(screen.getByRole('heading', { name: ERROR_COPY.heading })).toBeInTheDocument();
    expect(screen.getByText(ERROR_COPY.body)).toBeInTheDocument();
  });

  it('offers one retry, which re-renders the segment', () => {
    const reset = jest.fn();
    render(<ErrorScreen reset={reset} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('calls reset when the retry is pressed', async () => {
    const reset = jest.fn();
    render(<ErrorScreen reset={reset} />);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('shows the digest, which is all a redacted server error leaves to go on', () => {
    render(<ErrorScreen digest="1a2b3c4d5e" reset={jest.fn()} />);

    expect(screen.getByText('Reference: 1a2b3c4d5e')).toBeInTheDocument();
  });

  it('omits the reference line entirely for an error that carries no digest', () => {
    // A client-side throw has none, and "Reference:" followed by nothing is worse than
    // no line at all.
    render(<ErrorScreen reset={jest.fn()} />);

    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  });
});
