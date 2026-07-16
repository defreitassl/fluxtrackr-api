import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CategoryBudgetsService } from './category-budgets.service';
import { CreateCategoryBudgetDto } from './dto/create-category-budget.dto';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const category = (type = 'expense') => ({ id: 'category', userId: 'owner', name: 'Food', type });
const budget = (overrides: any = {}) => ({ id: 'budget', userId: 'owner', categoryId: 'category', year: 2026, month: 7, limitAmount: decimal('600.00'), warningPercentage: 80, isActive: true, createdAt: new Date(), updatedAt: new Date(), category: category(), ...overrides });

function harness(options: any = {}) {
  let current = options.current === undefined ? budget() : options.current;
  const prisma: any = {
    category: { findFirst: async ({ where }: any) => where.userId === 'owner' && (options.category ?? category()).type !== 'income' ? options.category ?? category() : null },
    categoryBudget: {
      create: async ({ data }: any) => { if (options.createError) throw options.createError; current = budget({ ...data, category: options.category ?? category() }); return current; },
      findFirst: async ({ where }: any) => current && where.userId === current.userId && where.id === current.id ? current : null,
      findMany: async (args: any) => (options.onFindMany?.(args), options.budgets ?? (current ? [current] : [])),
      update: async ({ data }: any) => { if (options.updateError) throw options.updateError; current = { ...current, ...data, category: options.category ?? current.category }; return current; },
    },
  };
  const spending: any = {
    getSpendingByCategory: async () => options.spending ?? new Map(),
    buildSummary: (_budgets: any, spendingValues: any) => options.summary ?? { totalLimit: '600.00', totalSpent: (spendingValues.get('category')?.totalSpent ?? decimal(0)).toFixed(2), totalRemaining: '600.00', usagePercentage: '0.00', budgetsCount: 1, withinBudgetCount: 1, nearLimitCount: 0, exceededCount: 0 },
  };
  return { service: new CategoryBudgetsService(prisma, spending), current: () => current };
}

describe('CategoryBudgetsService CRUD and overview', () => {
  const create = { categoryId: '00000000-0000-4000-8000-000000000001', year: 2026, month: 7, limitAmount: '600.00', warningPercentage: 80 };

  it('creates expense and both categories, formats money, and rejects income or another user', async () => {
    assert.equal((await harness().service.create('owner', create as any)).limitAmount, '600.00');
    assert.equal((await harness({ category: category('both') }).service.create('owner', create as any)).category.type, 'both');
    await assert.rejects(() => harness({ category: category('income') }).service.create('owner', create as any), BadRequestException);
    await assert.rejects(() => harness().service.create('other', create as any), BadRequestException);
  });

  it('returns 409 on create/update duplicate, archives, reactivates, and isolates users', async () => {
    const unique = new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
    await assert.rejects(() => harness({ createError: unique }).service.create('owner', create as any), ConflictException);
    await assert.rejects(() => harness({ updateError: unique }).service.update('owner', 'budget', { month: 8 }), ConflictException);
    const target = harness();
    assert.deepEqual(await target.service.remove('owner', 'budget'), { archived: true });
    assert.equal(target.current().isActive, false);
    assert.equal((await target.service.update('owner', 'budget', { isActive: true })).isActive, true);
    await assert.rejects(() => target.service.findOne('other', 'budget'), NotFoundException);
  });

  it('builds stable overview with within, near, exceeded and negative remaining', async () => {
    const budgets = [
      budget({ id: 'b', categoryId: 'b', category: category('expense'), limitAmount: decimal('100.00') }),
      budget({ id: 'a', categoryId: 'a', category: { ...category(), id: 'a', name: 'Fuel' }, limitAmount: decimal('100.00'), warningPercentage: 80 }),
    ];
    const spending = new Map([
      ['a', { transactionSpent: decimal('10'), creditCardSpent: decimal('70'), totalSpent: decimal('80') }],
      ['b', { transactionSpent: decimal('150'), creditCardSpent: decimal('0'), totalSpent: decimal('150') }],
    ]);
    const result = await harness({ budgets, spending, summary: { totalLimit: '200.00', totalSpent: '230.00', totalRemaining: '-30.00', usagePercentage: '115.00', budgetsCount: 2, withinBudgetCount: 0, nearLimitCount: 1, exceededCount: 1 } }).service.overview('owner', { year: 2026, month: 7, asOf: '2026-07-15T14:00:00.000Z' });
    assert.deepEqual(result.budgets.map((item: any) => [item.id, item.status, item.remainingAmount]), [['b', 'exceeded', '-50.00'], ['a', 'near_limit', '20.00']]);
    assert.equal(result.summary.totalSpent, '230.00');
  });

  it('validates invalid limit, month, warning percentage, and requires two decimal money strings', async () => {
    for (const payload of [
      { ...create, limitAmount: '0.00' }, { ...create, limitAmount: '1' }, { ...create, month: 13 }, { ...create, warningPercentage: 101 },
    ]) assert.ok((await validate(plainToInstance(CreateCategoryBudgetDto, payload))).length > 0);
  });
});
