import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { CategoryBudgetSpendingService, getBudgetStatus } from './category-budget-spending.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);

function harness(options: any = {}) {
  const calls: any = {};
  const prisma = {
    transaction: { groupBy: async (args: any) => (calls.transaction = args, options.transactions ?? []) },
    installment: { groupBy: async (args: any) => (calls.installment = args, options.installments ?? []) },
    categoryBudget: { findMany: async (args: any) => (calls.budgets = args, options.budgets ?? []) },
  };
  return { service: new CategoryBudgetSpendingService(prisma as any), calls };
}

describe('CategoryBudgetSpendingService', () => {
  it('groups realized account and card expenses by category using Decimal', async () => {
    const context = harness({
      transactions: [{ categoryId: 'food', _sum: { amount: decimal('250.10') } }, { categoryId: 'fuel', _sum: { amount: decimal('1.20') } }],
      installments: [{ categoryId: 'food', _sum: { installmentAmount: decimal('320.40') } }, { categoryId: 'travel', _sum: { installmentAmount: decimal('2.30') } }],
    });
    const result = await context.service.getSpendingByCategory('owner', 2026, 7, new Date('2026-07-15T14:00:00.000Z'));
    assert.equal(result.get('food')?.transactionSpent.toFixed(2), '250.10');
    assert.equal(result.get('food')?.creditCardSpent.toFixed(2), '320.40');
    assert.equal(result.get('food')?.totalSpent.toFixed(2), '570.50');
    assert.equal(result.get('travel')?.totalSpent.toFixed(2), '2.30');
    assert.deepEqual(context.calls.transaction.where.occurredAt, { gte: new Date('2026-07-01T00:00:00.000Z'), lte: new Date('2026-07-15T14:00:00.000Z') });
    assert.deepEqual(context.calls.transaction.where.paidCreditCardInvoice, { is: null });
    assert.equal(context.calls.transaction.where.realizedFixedOccurrence, undefined);
    assert.equal(context.calls.transaction.where.confirmedFinancialEvent, undefined);
    assert.equal(context.calls.transaction.where.realizedSubscriptionCharge, undefined);
  });

  it('uses invoice month, includes paid invoices, excludes canceled invoice/installment, and future month has zero realized spending', async () => {
    const context = harness();
    await context.service.getSpendingByCategory('owner', 2026, 7, new Date('2026-07-15T14:00:00.000Z'));
    assert.deepEqual(context.calls.installment.where.invoice, { is: { userId: 'owner', year: 2026, month: 7, status: { not: 'canceled' } } });
    assert.deepEqual(context.calls.installment.where.status, { not: 'canceled' });
    assert.deepEqual(context.calls.installment.where.purchase, { is: { purchaseDate: { lte: new Date('2026-07-15T14:00:00.000Z') } } });
    const future = harness();
    assert.equal((await future.service.getSpendingByCategory('owner', 2026, 8, new Date('2026-07-15T14:00:00.000Z'))).size, 0);
    assert.equal(future.calls.transaction, undefined);
    assert.equal(future.calls.installment, undefined);
  });

  it('calculates statuses, totals, negative remaining, percentages, and categories without budgets precisely', () => {
    const service = harness().service;
    const summary = service.buildSummary([
      { categoryId: 'one', limitAmount: decimal('0.30'), warningPercentage: 80 },
      { categoryId: 'two', limitAmount: decimal('1.00'), warningPercentage: 80 },
    ], new Map([
      ['one', { transactionSpent: decimal('0.10'), creditCardSpent: decimal('0.20'), totalSpent: decimal('0.30') }],
      ['two', { transactionSpent: decimal('1.10'), creditCardSpent: decimal('0'), totalSpent: decimal('1.10') }],
      ['without-budget', { transactionSpent: decimal('999'), creditCardSpent: decimal('0'), totalSpent: decimal('999') }],
    ]));
    assert.deepEqual(summary, { totalLimit: '1.30', totalSpent: '1.40', totalRemaining: '-0.10', usagePercentage: '107.69', budgetsCount: 2, withinBudgetCount: 0, nearLimitCount: 0, exceededCount: 2 });
    assert.equal(getBudgetStatus(decimal('0.79'), decimal('1'), 80), 'within_budget');
    assert.equal(getBudgetStatus(decimal('0.80'), decimal('1'), 80), 'near_limit');
    assert.equal(getBudgetStatus(decimal('1.00'), decimal('1'), 80), 'exceeded');
  });
});
