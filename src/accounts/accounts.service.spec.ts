import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AccountsService } from './accounts.service';

describe('AccountsService archiving', () => {
  it('lists only active accounts and archives without deleting history', async () => {
    const calls: any = {};
    const prisma: any = {
      account: {
        findMany: async (args: any) => (calls.findMany = args, []),
        findFirst: async () => ({ id: 'account', userId: 'user', isActive: true }),
        update: async (args: any) => (calls.update = args, { id: 'account', isActive: false }),
        delete: async () => { throw new Error('must not delete'); },
      },
    };
    const service = new AccountsService(prisma);
    await service.findMany('user');
    const result = await service.remove('user', 'account');
    assert.deepEqual(calls.findMany.where, { userId: 'user', isActive: true });
    assert.deepEqual(calls.update, { where: { id: 'account' }, data: { isActive: false } });
    assert.deepEqual(result, { archived: true });
  });
});
