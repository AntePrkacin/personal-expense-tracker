import { ConflictException } from '@nestjs/common';
import { InsightTriggersListener } from './insight-triggers.listener';
import type { InsightsService } from './insights.service';

/**
 * The listener that regenerates when the numbers behind a set move, and the one
 * thing it must never do: reject.
 *
 * Both write paths await `emitAsync`, so anything this rejects with lands in
 * `POST /api/transactions` or `PATCH /api/categories`. They catch too - both
 * halves are deliberate, neither is redundant - but a listener that leans on its
 * caller's catch is one refactor away from turning a saved write into a 500.
 * That is what these assert, now for **two** events rather than one.
 */
describe('InsightTriggersListener', () => {
  let generate: jest.Mock;
  let markDirty: jest.Mock;
  let listener: InsightTriggersListener;

  beforeEach(() => {
    generate = jest.fn().mockResolvedValue(undefined);
    markDirty = jest.fn();
    listener = new InsightTriggersListener({
      generate,
      markDirty,
    } as unknown as InsightsService);
  });

  describe('a transaction write', () => {
    it('starts a run for the user whose numbers moved', async () => {
      await listener.onTransactionChanged({
        userId: 'user-1',
        reason: 'created',
      });

      expect(generate).toHaveBeenCalledWith('user-1');
    });

    it.each(['created', 'updated', 'deleted'] as const)(
      'regenerates on a %s event, because all three move the numbers',
      async (reason) => {
        await listener.onTransactionChanged({ userId: 'user-1', reason });

        expect(generate).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('a category write', () => {
    it('starts a run for the user whose categories moved', async () => {
      await listener.onCategoryChanged({ userId: 'user-1', reason: 'updated' });

      expect(generate).toHaveBeenCalledWith('user-1');
    });

    it.each(['created', 'updated', 'caps-set', 'deleted'] as const)(
      'regenerates on a %s event, so one user action behaves the same whichever modal performed it',
      async (reason) => {
        await listener.onCategoryChanged({ userId: 'user-1', reason });

        expect(generate).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('failures', () => {
    it('swallows the single-run 409 and marks the account dirty instead', async () => {
      // The 409 means a run is already in flight. Until PET-73 that lost the
      // losing write's data until the next save; now the in-flight run starts
      // exactly one more when it completes.
      generate.mockRejectedValue(new ConflictException('in flight'));

      await expect(
        listener.onTransactionChanged({ userId: 'user-1', reason: 'created' }),
      ).resolves.toBeUndefined();
      expect(markDirty).toHaveBeenCalledWith('user-1');
    });

    it('marks dirty on a category 409 too, or the two triggers would not agree', async () => {
      generate.mockRejectedValue(new ConflictException('in flight'));

      await listener.onCategoryChanged({
        userId: 'user-1',
        reason: 'caps-set',
      });

      expect(markDirty).toHaveBeenCalledWith('user-1');
    });

    it('swallows any other failure, so a write can never fail over insights', async () => {
      generate.mockRejectedValue(new Error('the database went away'));

      await expect(
        listener.onTransactionChanged({ userId: 'user-1', reason: 'deleted' }),
      ).resolves.toBeUndefined();
    });

    it('does not mark dirty on an ordinary failure', async () => {
      // Nothing is in flight to pick the flag up, so setting it would leave a
      // permanently dirty account that only a future 409 could clear.
      generate.mockRejectedValue(new Error('the database went away'));

      await listener.onCategoryChanged({ userId: 'user-1', reason: 'deleted' });

      expect(markDirty).not.toHaveBeenCalled();
    });
  });
});
