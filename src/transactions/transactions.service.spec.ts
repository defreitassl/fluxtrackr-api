import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TransactionsService } from './transactions.service';

describe('TransactionsService category validation', () => {
  it('requires an active category compatible with the transaction type', async () => {
    const calls: any[] = [];
    const prisma: any = {
      category: { findFirst: async ({ where }: any) => { calls.push(where); return null; } },
    };
    const service = new TransactionsService(prisma, { record: async () => undefined } as any, { evaluateBudgetsForCategoryMonth: async () => undefined } as any);

    await assert.rejects(
      () => (service as any).ensureCategoryBelongsToUser('owner', 'category', 'expense'),
      { message: 'Invalid categoryId' },
    );
    assert.deepEqual(calls[0], {
      id: 'category', userId: 'owner', isActive: true, type: { in: ['expense', 'both'] },
    });
  });
});
