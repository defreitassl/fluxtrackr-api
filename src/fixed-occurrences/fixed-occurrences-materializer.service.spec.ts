import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { FixedOccurrencesMaterializerService } from './fixed-occurrences-materializer.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const template = (overrides: Record<string, unknown> = {}): any => ({
  id: 'template', userId: 'user', name: 'Rent', amount: decimal(100),
  categoryId: 'category', accountId: 'account', paymentMethod: 'pix',
  dueDay: 31, receiveDay: 30, isActive: true, ...overrides,
});

function harness(initial: any[] = [], templates: { expenses?: any[]; incomes?: any[] } = {}) {
  const rows = initial.map((row) => ({ ...row }));
  const calls = { findMany: 0, createMany: 0, update: 0, transactions: 0 };
  const fixedOccurrence = {
    findMany: async ({ where }: any) => {
      calls.findMany += 1;
      return rows.filter((row) => {
        const sourceMatches = where.fixedExpenseId
          ? row.fixedExpenseId === where.fixedExpenseId
          : row.fixedIncomeId === where.fixedIncomeId;
        return sourceMatches && where.OR.some((period: any) => row.year === period.year && row.month === period.month);
      });
    },
    createMany: async ({ data }: any) => {
      calls.createMany += 1;
      let count = 0;
      for (const item of data) {
        const duplicate = rows.some((row) => row.year === item.year && row.month === item.month &&
          ((item.fixedExpenseId && row.fixedExpenseId === item.fixedExpenseId) || (item.fixedIncomeId && row.fixedIncomeId === item.fixedIncomeId)));
        if (duplicate) continue;
        rows.push({ id: `occurrence-${rows.length + 1}`, status: 'pending', ...item });
        count += 1;
      }
      return { count };
    },
    update: async ({ where, data }: any) => {
      calls.update += 1;
      const row = rows.find((item) => item.id === where.id);
      if (!row) throw new Error('missing occurrence');
      Object.assign(row, data);
      return row;
    },
  };
  const prisma = {
    fixedOccurrence,
    fixedExpense: { findMany: async () => templates.expenses ?? [] },
    fixedIncome: { findMany: async () => templates.incomes ?? [] },
    $transaction: async (operations: Promise<unknown>[]) => {
      calls.transactions += 1;
      return Promise.all(operations);
    },
  };
  return { service: new FixedOccurrencesMaterializerService(prisma as any), rows, calls };
}

describe('FixedOccurrencesMaterializerService', () => {
  it('generates the current UTC month and next 13 months without duplicates', async () => {
    const context = harness();
    await context.service.materializeExpense(template(), new Date('2026-07-11T23:30:00-03:00'));
    await context.service.materializeExpense(template(), new Date('2026-07-12T02:30:00.000Z'));
    assert.equal(context.rows.length, 14);
    assert.deepEqual([context.rows[0].year, context.rows[0].month], [2026, 7]);
    assert.deepEqual([context.rows[13].year, context.rows[13].month], [2027, 8]);
  });

  it('clamps days 30 and 31 in February using UTC', async () => {
    const context = harness();
    await context.service.materializeExpense(template({ dueDay: 31 }), new Date('2027-01-15T23:00:00-03:00'));
    assert.equal(context.rows.find((row) => row.month === 2)?.occurrenceDate.toISOString(), '2027-02-28T00:00:00.000Z');
  });

  it('does not generate for archived templates', async () => {
    const context = harness();
    await context.service.materializeExpense(template({ isActive: false }), new Date('2026-07-01T00:00:00.000Z'));
    assert.equal(context.rows.length, 0);
  });

  it('updates pending snapshots but preserves realized and canceled snapshots', async () => {
    const base = { year: 2026, month: 7, fixedExpenseId: 'template', fixedIncomeId: null, name: 'Old', amount: decimal(1) };
    const context = harness([
      { ...base, id: 'pending', status: 'pending' },
      { ...base, id: 'realized', month: 8, status: 'realized' },
      { ...base, id: 'canceled', month: 9, status: 'canceled' },
    ]);
    await context.service.materializeExpense(template({ name: 'New' }), new Date('2026-07-01T00:00:00.000Z'));
    assert.equal(context.rows.find((row) => row.id === 'pending')?.name, 'New');
    assert.equal(context.rows.find((row) => row.id === 'realized')?.name, 'Old');
    assert.equal(context.rows.find((row) => row.id === 'canceled')?.name, 'Old');
  });

  it('separates expense and income sources when materializing all active templates', async () => {
    const context = harness([], { expenses: [template()], incomes: [template({ id: 'income', name: 'Salary' })] });
    await context.service.materializeAll(new Date('2026-07-01T00:00:00.000Z'));
    assert.equal(context.rows.filter((row) => row.type === 'expense' && row.fixedExpenseId).length, 14);
    assert.equal(context.rows.filter((row) => row.type === 'income' && row.fixedIncomeId).length, 14);
  });

  it('does not write again when the materialized snapshots are unchanged', async () => {
    const context = harness();
    const reference = new Date('2026-07-01T00:00:00.000Z');
    await context.service.materializeExpense(template(), reference);
    context.calls.createMany = 0;
    context.calls.update = 0;
    context.calls.transactions = 0;

    const metrics = await context.service.materializeExpense(template(), reference);

    assert.equal(metrics.recordsCreated, 0);
    assert.equal(metrics.recordsUpdated, 0);
    assert.equal(metrics.recordsCanceled, 0);
    assert.equal(metrics.recordsSkipped, 14);
    assert.equal(context.calls.createMany, 0);
    assert.equal(context.calls.update, 0);
    assert.equal(context.calls.transactions, 0);
  });
});
