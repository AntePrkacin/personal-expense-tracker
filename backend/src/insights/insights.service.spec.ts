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
  };

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

  describe('latestReadyTeaser', () => {
    it('returns the latest ready set headline for the dashboard', async () => {
      db.select.mockReturnValueOnce(queryChain([readyRow()]));

      await expect(service.latestReadyTeaser('user-id')).resolves.toBe(
        'You are on track this month',
      );
    });

    it('returns null when there is no ready set', async () => {
      db.select.mockReturnValueOnce(queryChain([]));

      await expect(service.latestReadyTeaser('user-id')).resolves.toBeNull();
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
      // 409 rather than a 500.
      db.select.mockReturnValue(queryChain([]));
      db.insert.mockReturnValue(
        queryChain(new Error('UNIQUE constraint failed: insight_sets.status')),
      );

      await expect(service.generate('user-id')).rejects.toThrow(
        ConflictException,
      );
      expect(generatorGenerate).not.toHaveBeenCalled();
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
});
