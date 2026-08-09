import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { argsOf, queryChain, toSql } from '../../test/query-chain';
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

  describe('latestReadySummary', () => {
    it('returns the latest ready set headline and body for the dashboard', async () => {
      db.select.mockReturnValueOnce(queryChain([readyRow()]));

      await expect(service.latestReadySummary('user-id')).resolves.toEqual({
        headline: 'You are on track this month',
        body: "You've spent $1,240 of your $2,000 budget.",
      });
    });

    it('returns null when there is no ready set', async () => {
      db.select.mockReturnValueOnce(queryChain([]));

      await expect(service.latestReadySummary('user-id')).resolves.toBeNull();
    });
  });

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
    /** Drives one floated run and hands back the transaction it wrote through. */
    const runWith = async (claimed: unknown[]) => {
      db.select.mockReturnValue(queryChain([]));
      generatorGenerate.mockResolvedValue(generatedSet());

      const updateChain = queryChain(claimed);
      const tx = {
        update: jest.fn().mockReturnValue(updateChain),
        insert: jest.fn().mockReturnValue(queryChain([])),
      };
      db.transaction.mockImplementation(
        (body: (handle: typeof tx) => Promise<unknown>) => body(tx),
      );

      await service.generate('user-id');
      await flushFloatedRun();

      return { tx, updateChain };
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
    });
  });
});
