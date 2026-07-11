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
  const fixedOccurrence = {
    updateMany: async ({ where, data }: any) => {
      const matches = rows.filter((row) => row.status === where.status && row.year === where.year && row.month === where.month &&
        (where.fixedExpenseId ? row.fixedExpenseId === where.fixedExpenseId : row.fixedIncomeId === where.fixedIncomeId));
      matches.forEach((row) => Object.assign(row, data));
      return { count: matches.length };
    },
    create: async ({ data }: any) => {
      if (rows.some((row) => row.year === data.year && row.month === data.month &&
        ((data.fixedExpenseId && row.fixedExpenseId === data.fixedExpenseId) || (data.fixedIncomeId && row.fixedIncomeId === data.fixedIncomeId)))) {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '7.8.0' });
      }
      const row = { id: `occurrence-${rows.length + 1}`, status: 'pending', ...data };
      rows.push(row); return row;
    },
  };
  const prisma = {
    fixedOccurrence,
    fixedExpense: { findMany: async () => templates.expenses ?? [] },
    fixedIncome: { findMany: async () => templates.incomes ?? [] },
  };
  return { service: new FixedOccurrencesMaterializerService(prisma as any), rows };
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
});
