import { queryChain, toSql, argsOf } from '../../test/query-chain';
import { DemoMembershipService } from './demo-membership.service';

describe('DemoMembershipService', () => {
  let service: DemoMembershipService;
  let select: jest.Mock;

  beforeEach(() => {
    select = jest.fn();
    service = new DemoMembershipService({ select } as never);
  });

  it('reports a pooled account, filtering tombstones', async () => {
    const chain = queryChain([{ id: 'pool-row-id' }]);
    select.mockReturnValue(chain);

    await expect(service.isPooled('demo-user-id')).resolves.toBe(true);

    const where = toSql(argsOf(chain, 'where')[0]);
    expect(where).toContain('"user_id" = ?');
    // A dismantled pool is not a pool: its entries are tombstoned, and an
    // account left behind by one must not keep the demo's lower budget.
    expect(where).toContain('"deleted_at" is null');
  });

  it('reports a real account', async () => {
    select.mockReturnValue(queryChain([]));

    await expect(service.isPooled('real-user-id')).resolves.toBe(false);
  });

  it('asks central once per user, however many times it is asked', async () => {
    select.mockReturnValue(queryChain([]));

    await service.isPooled('real-user-id');
    await service.isPooled('real-user-id');
    await service.isPooled('real-user-id');

    // The read is on the path of every chat turn and every receipt scan, and
    // membership does not change while an instance lives.
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('caches each user separately', async () => {
    select.mockReturnValueOnce(queryChain([{ id: 'pool-row-id' }]));
    select.mockReturnValueOnce(queryChain([]));

    await expect(service.isPooled('demo-user-id')).resolves.toBe(true);
    await expect(service.isPooled('real-user-id')).resolves.toBe(false);
    await expect(service.isPooled('demo-user-id')).resolves.toBe(true);

    expect(select).toHaveBeenCalledTimes(2);
  });
});
