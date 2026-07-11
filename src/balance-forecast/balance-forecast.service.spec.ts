import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BalanceForecastService, buildBalanceForecast } from './balance-forecast.service';
import { GetBalanceForecastDto } from './dto/get-balance-forecast.dto';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const asOf = new Date('2026-08-01T12:00:00.000Z');
const item = (overrides: Record<string, unknown> = {}): any => ({
  id: 'item', sourceType: 'financial_event', sourceId: 'item', type: 'expense',
  title: 'Item', amount: '10.00', date: '2026-08-01T13:00:00.000Z',
  status: 'planned', balanceImpact: 'projected', accountId: null,
  creditCardId: null, categoryId: null, metadata: {}, ...overrides,
});

function harness(options: { accounts?: any[]; transactions?: any[]; items?: any[] } = {}) {
  const calls: any = {};
  const prisma = {
    account: { findMany: async (args: any) => (calls.accounts = args, options.accounts ?? []) },
    transaction: { findMany: async (args: any) => (calls.transactions = args, options.transactions ?? []) },
  };
  const timeline = {
    findMany: async (userId: string, query: any) => {
      calls.timeline = { userId, query };
      return { items: options.items ?? [] };
    },
  };
  return { service: new BalanceForecastService(prisma as any, timeline as any), calls };
}

describe('BalanceForecastService queries and current balance', () => {
  it('isolates account, transaction, and timeline reads by authenticated user', async () => {
    const context = harness();
    await context.service.getForecast('owner', { asOf: asOf.toISOString(), horizonDays: 1 });
    assert.equal(context.calls.accounts.where.userId, 'owner');
    assert.equal(context.calls.transactions.where.userId, 'owner');
    assert.equal(context.calls.transactions.where.account.is.userId, 'owner');
    assert.equal(context.calls.timeline.userId, 'owner');
  });

  it('sums active account initial balances and realized transactions through asOf', async () => {
    const context = harness({
      accounts: [{ initialBalance: decimal('100.10') }, { initialBalance: decimal('200.20') }],
      transactions: [
        { type: 'income', amount: decimal('50.05') },
        { type: 'expense', amount: decimal('20.02') },
      ],
    });
    const result = await context.service.getForecast('owner', { asOf: asOf.toISOString(), horizonDays: 1 });
    assert.equal(result.currentBalance, '330.33');
    assert.deepEqual(context.calls.accounts.where, { userId: 'owner', isActive: true });
    assert.equal(context.calls.transactions.where.occurredAt.lte.toISOString(), asOf.toISOString());
    assert.deepEqual(context.calls.transactions.where.account.is, { userId: 'owner', isActive: true });
  });

  it('queries through the larger of the requested horizon and 30 days', async () => {
    const short = harness();
    await short.service.getForecast('owner', { asOf: asOf.toISOString(), horizonDays: 1 });
    assert.equal(short.calls.timeline.query.endDate, '2026-08-30T23:59:59.999Z');
    const long = harness();
    const result = await long.service.getForecast('owner', { asOf: asOf.toISOString(), horizonDays: 366 });
    assert.equal(result.points.length, 366);
    assert.equal(long.calls.timeline.query.endDate, '2027-08-01T23:59:59.999Z');
  });
});

describe('balance forecast calculation', () => {
  it('applies only projected items and does not double count paid invoices', () => {
    const result = buildBalanceForecast(asOf, 1, decimal(100), [
      item({ amount: '25.00', type: 'income' }),
      item({ amount: '50.00', balanceImpact: 'realized' }),
      item({ amount: '40.00', balanceImpact: 'informational', sourceType: 'credit_card_invoice', status: 'paid' }),
      item({ amount: '30.00', balanceImpact: 'none' }),
    ]);
    assert.equal(result.projectedIncome, '25.00');
    assert.equal(result.projectedExpense, '0.00');
    assert.equal(result.projectedFinalBalance, '125.00');
  });

  it('groups multiple movements by UTC day and emits empty days', () => {
    const result = buildBalanceForecast(asOf, 3, decimal(100), [
      item({ amount: '10.10', type: 'income', date: '2026-08-01T23:30:00.000Z' }),
      item({ id: 'second', amount: '2.05', date: '2026-08-01T13:00:00.000Z' }),
      item({ id: 'third', amount: '5.00', date: '2026-08-03T00:00:00.000Z' }),
    ]);
    assert.deepEqual(result.points, [
      { date: '2026-08-01', income: '10.10', expense: '2.05', netChange: '8.05', balance: '108.05' },
      { date: '2026-08-02', income: '0.00', expense: '0.00', netChange: '0.00', balance: '108.05' },
      { date: '2026-08-03', income: '0.00', expense: '5.00', netChange: '-5.00', balance: '103.05' },
    ]);
  });

  it('calculates final/minimum balance, first negative date, and 7/30-day windows', () => {
    const result = buildBalanceForecast(asOf, 10, decimal(50), [
      item({ amount: '60.00', date: '2026-08-02T00:00:00.000Z' }),
      item({ id: 'income', type: 'income', amount: '20.00', date: '2026-08-08T00:00:00.000Z' }),
      item({ id: 'late', amount: '5.00', date: '2026-08-20T00:00:00.000Z' }),
    ]);
    assert.equal(result.projectedFinalBalance, '10.00');
    assert.equal(result.minimumProjectedBalance, '-10.00');
    assert.equal(result.firstNegativeDate, '2026-08-02');
    assert.deepEqual(result.windows.next7Days, {
      projectedIncome: '0.00', projectedExpense: '60.00', projectedFinalBalance: '-10.00',
    });
    assert.deepEqual(result.windows.next30Days, {
      projectedIncome: '20.00', projectedExpense: '65.00', projectedFinalBalance: '5.00',
    });
  });

  it('preserves decimal precision without intermediate number conversion', () => {
    const result = buildBalanceForecast(asOf, 1, decimal('0.10'), [
      item({ type: 'income', amount: '0.20' }), item({ id: 'tiny', amount: '0.30' }),
    ]);
    assert.equal(result.projectedFinalBalance, '0.00');
    assert.equal(result.firstNegativeDate, null);
  });
});

describe('GetBalanceForecastDto validation', () => {
  it('accepts horizonDays 1 and 366 and defaults to 30', async () => {
    assert.equal(plainToInstance(GetBalanceForecastDto, {}).horizonDays, 30);
    assert.equal((await validate(plainToInstance(GetBalanceForecastDto, { horizonDays: '1' }))).length, 0);
    assert.equal((await validate(plainToInstance(GetBalanceForecastDto, { horizonDays: '366' }))).length, 0);
  });

  it('rejects invalid horizons and dates', async () => {
    for (const value of ['0', '367', '1.5', 'invalid']) {
      assert.ok((await validate(plainToInstance(GetBalanceForecastDto, { horizonDays: value }))).length > 0);
    }
    assert.ok((await validate(plainToInstance(GetBalanceForecastDto, { asOf: 'not-a-date' }))).length > 0);
  });
});
