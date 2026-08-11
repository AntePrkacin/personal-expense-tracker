import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { argsOf, paramsOf, queryChain, toSql } from '../../test/query-chain';
import { UserDatabaseService } from '../database/user-database.service';
import { INSIGHT_GENERATOR } from './insight-generator';
import { InsightsService } from './insights.service';

/**
 * Unit cover for the state-derivation logic `test/insights.e2e-spec.ts` cannot
 * isolate cleanly.
 *
 * The e2e suite is the real proof of the SQL: that `status = 'ready'` skips a
 * failed run, that `generated_at DESC` picks the newest set, and that a
 * generating row is seen against a migrated database. What is left for here is
 * the pure composition on top of those reads - how `empty`, `generating` and
 * `ready` combine, and that a run in flight reports `generating` while the last
 * ready set's content still comes back - plus a check that the newest-ready query
 * really filters and orders the way AC5 and AC6 depend on.
 */
describe('InsightsService', () => {
  let service: InsightsService;
  let getUserDb: jest.Mock;
  let generatorGenerate: jest.Mock;
  let db: {
    select: jest.Mock;
    insert: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
    transaction: jest.Mock;
  };

  /** Lets the floated `runGeneration` settle before its writes are asserted. */
  const flushFloatedRun = () => new Promise((resolve) => setImmediate(resolve));

  /**
   * A write failure shaped the way Drizzle really throws one: its own message is
   * the failed SQL and the constraint text hangs off `cause`. Asserting against a
   * bare driver message here is what let the 409 translation ship broken.
   */
  const writeFailure = (constraint: string) => {
    const error = new Error('Failed query: insert into "insight_sets" ...');
    error.cause = new Error(
      `step failed: Runtime error: UNIQUE constraint failed: ${constraint} (19)`,
    );
    return error;
  };

  const generatedSet = () => ({
    monthLabel: 'October 2025',
    summary: {
      headline: 'You are on track this month',
      body: "You've spent $1,240 of your $2,000 budget.",
    },
    cards: [
      {
        tone: 'warning' as const,
        title: 'Dining out is over budget',
        body: '$312 of $300 - $12 over',
      },
    ],
  });

  const readyRow = () => ({
    id: 'set-1',
    status: 'ready',
    monthLabel: 'October 2025',
    summaryHeadline: 'You are on track this month',
    summaryBody: "You've spent $1,240 of your $2,000 budget.",
    generatedAt: new Date('2025-10-20T09:00:00.000Z'),
    createdAt: new Date('2025-10-20T09:00:00.000Z'),
    deletedAt: null,
  });

  /**
   * Stored card rows, deliberately including a tone the DTO union no longer
   * declares.
   *
   * `insights.tone` is a plain text column with no CHECK constraint and
   * `cardsFor` casts it unchecked, so PET-42-43-44 retiring `info` did nothing
   * to the sets already on disk. This factory is untyped for that reason - it
   * stands in for database rows rather than for generated cards - so a retired
   * tone travels through the read exactly as it would in production, which is
   * what the frontend's tone-map fallback exists to catch.
   */
  const cardRows = () => [
    {
      tone: 'warning',
      title: 'Dining out is over budget',
      body: '$312 of $300 - $12 over',
    },
    {
      tone: 'info',
      title: 'On pace for $1,980',
      body: 'Just under your $2,000 target',
    },
  ];

  const build = async () => {
    getUserDb = jest.fn().mockResolvedValue(db);
    generatorGenerate = jest.fn().mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        InsightsService,
        { provide: UserDatabaseService, useValue: { getUserDb } },
        {
          provide: INSIGHT_GENERATOR,
          useValue: { generate: generatorGenerate },
        },
      ],
    }).compile();

    service = moduleRef.get(InsightsService);
  };

  beforeEach(async () => {
    db = {
      select: jest.fn(),
      insert: jest.fn().mockReturnValue(queryChain([])),
      delete: jest.fn().mockReturnValue(queryChain([])),
      update: jest.fn().mockReturnValue(queryChain([])),
      transaction: jest.fn(),
    };
    await build();
  });

  describe('getSet', () => {
    it('reports empty with null content when nothing has ever generated', async () => {
      // latestReadySet: none. hasRunInFlight: none. cardsFor is never reached.
      db.select
        .mockReturnValueOnce(queryChain([]))
        .mockReturnValueOnce(queryChain([]));

      await expect(service.getSet('user-id')).resolves.toEqual({
        state: 'empty',
        monthLabel: null,
        summary: null,
        insights: [],
        generatedAt: null,
      });
    });

    it('reports ready with the set content and cards in order', async () => {
      db.select
        .mockReturnValueOnce(queryChain([readyRow()]))
        .mockReturnValueOnce(queryChain([])) // no run in flight
        .mockReturnValueOnce(queryChain(cardRows()));

      await expect(service.getSet('user-id')).resolves.toEqual({
        state: 'ready',
        monthLabel: 'October 2025',
        summary: {
          headline: 'You are on track this month',
          body: "You've spent $1,240 of your $2,000 budget.",
        },
        insights: cardRows(),
        generatedAt: '2025-10-20T09:00:00.000Z',
      });
    });

    it('reports generating during a regenerate but still returns the last ready content', async () => {
      // The whole point of decision 3: the page renders skeletons off `state`,
      // while the dashboard teaser keeps reading this same last-good content.
      db.select
        .mockReturnValueOnce(queryChain([readyRow()]))
        .mockReturnValueOnce(queryChain([{ id: 'set-2' }])) // a run in flight
        .mockReturnValueOnce(queryChain(cardRows()));

      const result = await service.getSet('user-id');

      expect(result.state).toBe('generating');
      expect(result.summary).not.toBeNull();
      expect(result.monthLabel).toBe('October 2025');
      expect(result.insights).toHaveLength(2);
    });

    it('reports generating with null content while the very first run is in flight', async () => {
      // No ready set yet, so there is no last-good content to carry - just the
      // generating state the empty-to-first-set transition shows.
      db.select
        .mockReturnValueOnce(queryChain([])) // no ready set
        .mockReturnValueOnce(queryChain([{ id: 'set-1' }])); // run in flight

      await expect(service.getSet('user-id')).resolves.toEqual({
        state: 'generating',
        monthLabel: null,
        summary: null,
        insights: [],
        generatedAt: null,
      });
    });

    it('asks only for ready sets, newest first, so a failed run is skipped (AC5, AC6)', async () => {
      const readyQuery = queryChain([readyRow()]);
      db.select
        .mockReturnValueOnce(readyQuery)
        .mockReturnValueOnce(queryChain([]))
        .mockReturnValueOnce(queryChain(cardRows()));

      await service.getSet('user-id');

      // The failure path needs no restore step precisely because this read only
      // ever considers `ready` rows and takes the newest by `generated_at`.
      const [where] = argsOf(readyQuery, 'where');
      const [orderBy] = argsOf(readyQuery, 'orderBy');
      expect(toSql(where)).toContain('"status" = ?');
      expect(toSql(where)).toContain('"deleted_at" is null');
      expect(toSql(orderBy)).toContain('"generated_at" desc');
    });

    it('counts only a fresh generating row as in flight (stale cutoff)', async () => {
      // A `generating` row older than the cutoff is an abandoned run, so
      // hasRunInFlight filters on `created_at` rather than letting it win the
      // state and wedge the read forever.
      const readyQuery = queryChain([]);
      const inFlightQuery = queryChain([{ id: 'run-1' }]);
      db.select
        .mockReturnValueOnce(readyQuery)
        .mockReturnValueOnce(inFlightQuery);

      await service.getSet('user-id');

      const [where] = argsOf(inFlightQuery, 'where');
      expect(toSql(where)).toContain('"status" = ?');
      expect(toSql(where)).toContain('"created_at" >');
      expect(toSql(where)).toContain('"deleted_at" is null');
    });
  });

  // `latestReadySummary` was covered here until PET-73 removed it with
  // `DashboardResponseDto.insight`. Nothing composes this service now; the
  // Dashboard reads `GET /api/insights` itself, which `getSet` above serves and
  // this file already covers in all three states.

  describe('generate', () => {
    it('rejects with 409 when a run is already in flight, inserting nothing', async () => {
      // hasRunInFlight finds a generating row, so a second run is refused rather
      // than started - regenerate is disabled while one is running (A26).
      db.select.mockReturnValue(queryChain([{ id: 'run-1' }]));

      await expect(service.generate('user-id')).rejects.toThrow(
        ConflictException,
      );
      expect(db.insert).not.toHaveBeenCalled();
      expect(generatorGenerate).not.toHaveBeenCalled();
    });

    it('inserts a generating row before returning, so the 202 is truthful', async () => {
      // No run in flight. The generating row must be written before generate()
      // resolves, so a concurrent read can observe the generating state; the
      // generation itself is floated.
      db.select.mockReturnValue(queryChain([]));
      const insertChain = queryChain([]);
      db.insert.mockReturnValue(insertChain);

      await service.generate('user-id');

      expect(argsOf(insertChain, 'values')[0]).toMatchObject({
        status: 'generating',
      });
    });

    it('reclaims an abandoned run before starting, marking it failed', async () => {
      // A `generating` row past the stale cutoff is flipped to `failed` first, so
      // the state self-heals and the unique index does not reject the new insert.
      db.select.mockReturnValue(queryChain([]));
      const updateChain = queryChain([]);
      db.update.mockReturnValue(updateChain);

      await service.generate('user-id');

      expect(argsOf(updateChain, 'set')[0]).toEqual({ status: 'failed' });
      const [where] = argsOf(updateChain, 'where');
      expect(toSql(where)).toContain('"status" = ?');
      expect(toSql(where)).toContain('"created_at" <');
      expect(toSql(where)).toContain('"deleted_at" is null');
    });

    it('translates a unique-index collision into the same 409', async () => {
      // No row seen by the check, but a concurrent POST slipped in between the
      // check and this insert; the partial unique index rejects it and the driver
      // reports a UNIQUE constraint failure, which becomes the one-run-at-a-time
      // 409 rather than a 500. The error is shaped the way Drizzle really wraps
      // one, so a check that only reads `error.message` fails here rather than in
      // production - the e2e suite proves the collision itself.
      db.select.mockReturnValue(queryChain([]));
      db.insert.mockReturnValue(
        queryChain(writeFailure('insight_sets.status')),
      );

      await expect(service.generate('user-id')).rejects.toThrow(
        ConflictException,
      );
      expect(generatorGenerate).not.toHaveBeenCalled();
    });

    it('does not mistake a primary-key collision for the single-run 409', async () => {
      // The same driver reports a `newId()` clash as `... insight_sets.id`. That
      // is a broken invariant and belongs in the generic 500, not in "a run is
      // already in progress", so the column is matched rather than the table.
      db.select.mockReturnValue(queryChain([]));
      db.insert.mockReturnValue(queryChain(writeFailure('insight_sets.id')));

      const error: unknown = await service
        .generate('user-id')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(ConflictException);
    });

    it('rethrows an insert error that is not the single-run collision', async () => {
      db.select.mockReturnValue(queryChain([]));
      db.insert.mockReturnValue(queryChain(new Error('database is locked')));

      const error: unknown = await service
        .generate('user-id')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe('database is locked');
    });
  });

  describe('the completion path, reached through generate', () => {
    /**
     * Drives one floated run and hands back the transaction it wrote through.
     *
     * `settled` is what the prune's own read finds - every non-`generating` set
     * in the account, newest first, this run's own included. The default of one
     * row is the ordinary case: a first completion supersedes nothing.
     *
     * The `tx` handle carries `select` and `delete` as well as `update` and
     * `insert`, and that is load-bearing rather than completeness: without them
     * the prune throws inside the completion transaction, the run is caught and
     * logged as failed, and every assertion below still passes.
     */
    const runWith = async (
      claimed: unknown[],
      settled: unknown[] = [{ id: 'run-1' }],
    ) => {
      db.select.mockReturnValue(queryChain([]));
      generatorGenerate.mockResolvedValue(generatedSet());

      const updateChain = queryChain(claimed);
      // Cards first, then their sets - the order `runGeneration` deletes in.
      const cardDelete = queryChain([]);
      const setDelete = queryChain([]);
      const pending = [cardDelete, setDelete];
      const selectChain = queryChain(settled);
      const tx = {
        update: jest.fn().mockReturnValue(updateChain),
        insert: jest.fn().mockReturnValue(queryChain([])),
        select: jest.fn().mockReturnValue(selectChain),
        delete: jest.fn(() => pending.shift() ?? queryChain([])),
      };
      db.transaction.mockImplementation(
        (body: (handle: typeof tx) => Promise<unknown>) => body(tx),
      );

      await service.generate('user-id');
      await flushFloatedRun();

      return { tx, updateChain, cardDelete, setDelete, selectChain };
    };

    it('writes the set and its cards when the run still owns the state', async () => {
      const { tx, updateChain } = await runWith([{ id: 'run-1' }]);

      expect(tx.insert).toHaveBeenCalled();
      expect(argsOf(updateChain, 'set')[0]).toMatchObject({ status: 'ready' });
      // Both halves of the guard: this row, and only while it is still ours.
      const [where] = argsOf(updateChain, 'where');
      expect(toSql(where)).toContain('"id" = ?');
      expect(toSql(where)).toContain('"status" = ?');
    });

    it('writes nothing when the run was reclaimed as abandoned mid-flight', async () => {
      // The completion UPDATE carries the status, so a newer run having flipped
      // this row to `failed` makes it match nothing. The cards must not land
      // either, or they would hang off a set the read will never serve.
      const { tx } = await runWith([]);

      expect(tx.insert).not.toHaveBeenCalled();
      // And it prunes nothing either: a run that lost its claim must not delete
      // history on behalf of the run that replaced it.
      expect(tx.delete).not.toHaveBeenCalled();
    });

    it('deletes nothing when the completed run supersedes nothing', async () => {
      // The ordinary first completion: one settled set in the account, its own.
      const { tx } = await runWith([{ id: 'run-1' }], [{ id: 'run-1' }]);

      expect(tx.select).toHaveBeenCalled();
      expect(tx.delete).not.toHaveBeenCalled();
    });

    it('deletes the sets past the retention with their cards, cards first', async () => {
      // Five settled sets, newest first. The retention keeps three, so the two
      // oldest go - and their cards go before them, or a failure between the two
      // statements would strand cards pointing at a set that no longer exists.
      const { tx, cardDelete, setDelete, selectChain } = await runWith(
        [{ id: 'run-1' }],
        ['run-1', 'run-2', 'run-3', 'run-4', 'run-5'].map((id) => ({ id })),
      );

      expect(tx.delete).toHaveBeenCalledTimes(2);
      expect(paramsOf(argsOf(cardDelete, 'where')[0])).toEqual([
        'run-4',
        'run-5',
      ]);
      expect(paramsOf(argsOf(setDelete, 'where')[0])).toEqual([
        'run-4',
        'run-5',
      ]);

      // The read behind it skips live runs rather than ordering around them: a
      // `generating` row is either this run's own, already updated to `ready`
      // above, or a claim that is not this prune's to delete.
      const [where] = argsOf(selectChain, 'where');
      expect(toSql(where)).toContain('"status" <> ?');
    });
  });

  /**
   * The bounded dirty flag (PET-73).
   *
   * `docs/TODO.md` recorded that a burst of writes leaves a stale set - writes
   * 2..N all lose the single-run 409 - and that every honest fix looks like a
   * re-entrant loop on the write path. **The bound is the whole argument for
   * doing it**, so what is asserted here is not that a follow-up run happens but
   * that it happens **once**, and that the paths which must not schedule one do
   * not.
   */
  describe('the dirty flag', () => {
    /** Several macrotask turns, since a follow-up run is floated off a floated run. */
    const settle = async () => {
      for (let turn = 0; turn < 5; turn += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    };

    /** A completion transaction that claims the row, so the success path is taken. */
    const claimingTransaction = () => {
      const tx = {
        update: jest.fn().mockReturnValue(queryChain([{ id: 'run-1' }])),
        insert: jest.fn().mockReturnValue(queryChain([])),
        select: jest.fn().mockReturnValue(queryChain([{ id: 'run-1' }])),
        delete: jest.fn().mockReturnValue(queryChain([])),
      };
      db.transaction.mockImplementation(
        (body: (handle: typeof tx) => Promise<unknown>) => body(tx),
      );
    };

    beforeEach(() => {
      db.select.mockReturnValue(queryChain([]));
      claimingTransaction();
    });

    it('starts exactly one more run when a write landed during the first', async () => {
      // The 409's listener marks the account dirty; here that lands while the
      // generator is mid-read, which is precisely the burst this closes.
      generatorGenerate
        .mockImplementationOnce(() => {
          service.markDirty('user-id');
          return Promise.resolve(generatedSet());
        })
        .mockImplementation(() => Promise.resolve(generatedSet()));

      await service.generate('user-id');
      await settle();

      expect(generatorGenerate).toHaveBeenCalledTimes(2);
    });

    it('stops at two runs, because each run clears the flag as it starts', async () => {
      // This is the bound. Nothing sets the flag again after the first run
      // cleared it, so the second run finds it clear and schedules nothing -
      // there is no path from run 2 to run 3.
      generatorGenerate
        .mockImplementationOnce(() => {
          service.markDirty('user-id');
          return Promise.resolve(generatedSet());
        })
        .mockImplementation(() => Promise.resolve(generatedSet()));

      await service.generate('user-id');
      await settle();
      await settle();

      expect(generatorGenerate).toHaveBeenCalledTimes(2);
    });

    it('collapses a burst of N writes into at most two runs', async () => {
      generatorGenerate
        .mockImplementationOnce(() => {
          // Five more writes lose the 409 while this run reads.
          for (let write = 0; write < 5; write += 1) {
            service.markDirty('user-id');
          }
          return Promise.resolve(generatedSet());
        })
        .mockImplementation(() => Promise.resolve(generatedSet()));

      await service.generate('user-id');
      await settle();

      expect(generatorGenerate).toHaveBeenCalledTimes(2);
    });

    it('starts one more run when the account was empty during the run', async () => {
      // The empty-account path settles the state too - it removes its own
      // placeholder - so it owes the same follow-up. Reachable in one step:
      // deleting the last transaction starts this run, and a create landing
      // before it returns loses the 409 and marks the account dirty. Shipped
      // without it, the new transaction reached no set until the next write.
      generatorGenerate
        .mockImplementationOnce(() => {
          service.markDirty('user-id');
          return Promise.resolve(null);
        })
        .mockImplementation(() => Promise.resolve(generatedSet()));

      await service.generate('user-id');
      await settle();

      expect(generatorGenerate).toHaveBeenCalledTimes(2);
    });

    it('starts nothing extra when no write landed during the run', async () => {
      generatorGenerate.mockResolvedValue(generatedSet());

      await service.generate('user-id');
      await settle();

      expect(generatorGenerate).toHaveBeenCalledTimes(1);
    });

    it('schedules no follow-up from a failed run', async () => {
      // A run that failed has not settled the state a follow-up would be
      // scheduling against, and chaining off it is how a bounded retry becomes
      // an unbounded one. The flag stays set for the next write to act on.
      generatorGenerate.mockImplementationOnce(() => {
        service.markDirty('user-id');
        return Promise.reject(new Error('the generator blew up'));
      });

      await service.generate('user-id');
      await settle();

      expect(generatorGenerate).toHaveBeenCalledTimes(1);
    });

    it('schedules no follow-up from a run reclaimed as abandoned', async () => {
      // The row was flipped to `failed` by a newer run, so this one owns
      // nothing - including the right to decide what generates next.
      const tx = {
        update: jest.fn().mockReturnValue(queryChain([])), // claimed nothing
        insert: jest.fn().mockReturnValue(queryChain([])),
        select: jest.fn().mockReturnValue(queryChain([])),
        delete: jest.fn().mockReturnValue(queryChain([])),
      };
      db.transaction.mockImplementation(
        (body: (handle: typeof tx) => Promise<unknown>) => body(tx),
      );
      generatorGenerate.mockImplementationOnce(() => {
        service.markDirty('user-id');
        return Promise.resolve(generatedSet());
      });

      await service.generate('user-id');
      await settle();

      expect(generatorGenerate).toHaveBeenCalledTimes(1);
    });

    it('keeps the flag per user, so one account cannot regenerate another', async () => {
      generatorGenerate.mockImplementation(() =>
        Promise.resolve(generatedSet()),
      );

      service.markDirty('someone-else');
      await service.generate('user-id');
      await settle();

      expect(generatorGenerate).toHaveBeenCalledTimes(1);
      expect(generatorGenerate).toHaveBeenCalledWith('user-id');
    });
  });
});
