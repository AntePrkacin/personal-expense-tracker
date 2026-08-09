import { ConflictException } from '@nestjs/common';
import type { InsightsService } from './insights.service';
import { TransactionChangedListener } from './transaction-changed.listener';

/**
 * The listener that regenerates on a transaction write, and the one thing it
 * must never do: reject.
 *
 * `TransactionsService` awaits `emitAsync`, so anything this rejects with lands
 * in `POST /api/transactions`. The write path catches too - both halves are
 * deliberate, neither is redundant - but a listener that leans on its caller's
 * catch is one refactor away from turning a saved transaction into a 500. That
 * is what these assert.
 */
describe('TransactionChangedListener', () => {
  let generate: jest.Mock;
  let listener: TransactionChangedListener;

  beforeEach(() => {
    generate = jest.fn().mockResolvedValue(undefined);
    listener = new TransactionChangedListener({
      generate,
    } as unknown as InsightsService);
  });

  it('starts a run for the user whose numbers moved', async () => {
    await listener.regenerate({ userId: 'user-1', reason: 'created' });

    expect(generate).toHaveBeenCalledWith('user-1');
  });

  it.each(['created', 'updated', 'deleted'] as const)(
    'regenerates on a %s event, because all three move the numbers',
    async (reason) => {
      await listener.regenerate({ userId: 'user-1', reason });

      expect(generate).toHaveBeenCalledTimes(1);
    },
  );

  it('swallows the single-run 409, which is a benign outcome', async () => {
    // A run is already in flight, so fresh-enough content is already being
    // generated. The losing write's data is missing from that set until the next
    // save - bounded by one run, self-healing, and the accepted cost.
    generate.mockRejectedValue(new ConflictException('in flight'));

    await expect(
      listener.regenerate({ userId: 'user-1', reason: 'created' }),
    ).resolves.toBeUndefined();
  });

  it('swallows any other failure too, so a write can never fail over insights', async () => {
    generate.mockRejectedValue(new Error('the database went away'));

    await expect(
      listener.regenerate({ userId: 'user-1', reason: 'deleted' }),
    ).resolves.toBeUndefined();
  });
});
