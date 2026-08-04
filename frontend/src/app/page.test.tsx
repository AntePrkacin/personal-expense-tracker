import { redirect } from 'next/navigation';

import Home from './page';

// `redirect` works by throwing, so it cannot be exercised for real under Jest:
// the thrown control-flow signal is caught by the App Router, which is not here.
// Mocking it turns "did the page choose the right destination" into an ordinary
// assertion, which is the only thing worth asserting about a page whose entire
// body is one call.
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

describe('Home page', () => {
  it('sends the visitor to the dashboard', () => {
    Home();

    // Hard-coded rather than read from a constant: this string and the sidebar's
    // own /dashboard href are two independent halves of the same contract, and a
    // shared constant would let them move together and stay wrong.
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('renders nothing of its own', () => {
    // Guards against somebody putting a "redirecting..." screen here. There is
    // no such frame in the design, and the page never paints: the redirect is
    // answered before a response body exists.
    expect(Home()).toBeUndefined();
  });
});
