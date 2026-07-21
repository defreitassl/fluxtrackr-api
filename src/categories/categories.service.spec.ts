import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { CategoriesService } from './categories.service';

function harness() {
  const category: any = { id: 'category', userId: 'owner', name: 'Food', type: 'expense', isActive: true };
  const budgets: any[] = [{ id: 'budget', categoryId: 'category', userId: 'owner', isActive: true }];
  const calls: any = {};
  const tx: any = {
    category: {
      findFirst: async ({ where }: any) => where.id === category.id && where.userId === category.userId ? category : null,
      update: async ({ data }: any) => Object.assign(category, data),
    },
    categoryBudget: {
      findFirst: async ({ where }: any) => budgets.find((item) => item.categoryId === where.categoryId && item.isActive) ?? null,
      updateMany: async ({ where, data }: any) => { calls.archiveBudgets = { where, data }; budgets.filter((item) => item.categoryId === where.categoryId && item.isActive).forEach((item) => Object.assign(item, data)); },
    },
  };
  const prisma: any = { $transaction: async (operation: any) => operation(tx), category: { ...tx.category, findMany: async ({ where }: any) => { calls.listWhere = where; return []; } } };
  return { service: new CategoriesService(prisma), category, budgets, calls };
}

describe('CategoriesService archive lifecycle', () => {
  it('archives category and active budgets atomically without deleting financial history', async () => {
    const target = harness();
    assert.deepEqual(await target.service.remove('owner', 'category'), { archived: true });
    assert.equal(target.category.isActive, false);
    assert.equal(target.budgets[0].isActive, false);
    assert.deepEqual(target.calls.archiveBudgets.data, { isActive: false });
    await assert.rejects(() => target.service.remove('other', 'category'));
  });

  it('rejects expense/both to income while active budget exists, but allows archived budget', async () => {
    await assert.rejects(() => harness().service.update('owner', 'category', { type: 'income' } as any), { message: 'Category with active budgets cannot be changed to income' });
    const target = harness();
    target.budgets[0].isActive = false;
    assert.equal((await target.service.update('owner', 'category', { type: 'income' } as any) as any).type, 'income');
  });

  it('migration adds active default without data deletion', () => {
    const migration = readFileSync(join(process.cwd(), 'prisma/migrations/20260715193000_archive_categories_safely/migration.sql'), 'utf8');
    assert.match(migration, /ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true/);
    assert.doesNotMatch(migration, /DELETE|DROP/i);
  });

  it('keeps active-by-default while allowing an explicit all-status query', async () => {
    const target = harness();
    await target.service.findMany('owner', {});
    assert.equal(target.calls.listWhere.isActive, true);
    await target.service.findMany('owner', { includeArchived: true });
    assert.equal(target.calls.listWhere.isActive, undefined);
  });
});
