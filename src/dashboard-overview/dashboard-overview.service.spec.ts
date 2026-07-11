import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  buildDashboardBalance,
  DashboardOverviewService,
  getUtcDashboardBoundaries,
} from './dashboard-overview.service';
import { GetDashboardOverviewDto } from './dto/get-dashboard-overview.dto';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const asOf = new Date('2026-07-15T14:00:00.000Z');
const installment = (amount: string | number, status = 'pending') => ({
  installmentAmount: decimal(amount), status,
});
const invoice = (overrides: Record<string, unknown> = {}): any => ({
  id: 'invoice', creditCardId: 'card', dueDate: new Date('2026-07-20T00:00:00.000Z'),
  status: 'open', creditCard: { name: 'Nubank' }, installments: [installment(100)],
  ...overrides,
});
const timelineItem = (index: number, overrides: Record<string, unknown> = {}): any => ({
  id: `item-${index}`, sourceType: 'financial_event', sourceId: `source-${index}`,
  type: 'expense', title: `Commitment ${index}`, amount: '10.00',
  date: new Date(Date.UTC(2026, 6, 15 + index)).toISOString(), status: 'planned',
  balanceImpact: 'projected', categoryId: null, accountId: null,
  creditCardId: null, metadata: {}, ...overrides,
});
const transaction = (index: number): any => ({
  id: `transaction-${index}`, type: 'expense', amount: decimal(`${index}.10`),
  description: `Transaction ${index}`, occurredAt: new Date(`2026-07-${String(15 - index).padStart(2, '0')}T12:00:00.000Z`),
  paymentMethod: 'pix', source: 'app', account: { id: 'account', name: 'Checking' },
  category: { id: 'category', name: 'Food', type: 'expense' },
});

function harness(options: Record<string, any> = {}) {
  const calls: Record<string, any> = {};
  const prisma = {
    creditCardInvoice: { findMany: async (args: any) => (calls.invoices = args, options.invoices ?? []) },
    fixedOccurrence: { findMany: async (args: any) => (calls.occurrences = args, options.occurrences ?? []) },
    financialEvent: { findMany: async (args: any) => (calls.events = args, options.events ?? []) },
    transaction: {
      aggregate: async (args: any) => (calls.spentToday = args, { _sum: { amount: options.spentToday ?? null } }),
      findMany: async (args: any) => (calls.latestTransactions = args, options.transactions ?? []),
    },
  };
  const forecast = {
    getForecast: async (userId: string, query: any) => {
      calls.forecast = { userId, query };
      return {
        currentBalance: options.currentBalance ?? '1000.00',
        projectedFinalBalance: '800.00', minimumProjectedBalance: '700.00',
        firstNegativeDate: options.firstNegativeDate ?? null,
      };
    },
  };
  const timeline = {
    findMany: async (userId: string, query: any, timelineOptions: any) => {
      calls.timeline = { userId, query, options: timelineOptions };
      return { items: options.timelineItems ?? [] };
    },
  };
  return {
    service: new DashboardOverviewService(prisma as any, forecast as any, timeline as any),
    calls,
  };
}

describe('dashboard balance and daily spending calculations', () => {
  it('keeps decimal precision and calculates positive available balance', () => {
    const result = buildDashboardBalance(decimal('0.30'), decimal('0.10'), decimal('0.03'), 2);
    assert.deepEqual(result.balance, { total: '0.30', committed: '0.10', availableToSpend: '0.20' });
    assert.deepEqual(result.dailySpending, {
      recommended: '0.10', spentToday: '0.03', remainingToday: '0.07',
      daysRemainingInMonth: 2, status: 'within_plan',
    });
  });

  it('allows negative available balance and reports no available balance', () => {
    const result = buildDashboardBalance(decimal(100), decimal(150), decimal(5), 17);
    assert.equal(result.balance.availableToSpend, '-50.00');
    assert.equal(result.dailySpending.recommended, '0.00');
    assert.equal(result.dailySpending.remainingToday, '-5.00');
    assert.equal(result.dailySpending.status, 'no_available_balance');
  });

  it('reports over plan when today spending exceeds the recommendation', () => {
    const result = buildDashboardBalance(decimal(100), decimal(0), decimal(11), 10);
    assert.equal(result.dailySpending.status, 'over_plan');
    assert.equal(result.dailySpending.remainingToday, '-1.00');
  });

  it('uses UTC month boundaries, includes today, handles last day and February', () => {
    assert.deepEqual(getUtcDashboardBoundaries(asOf), {
      dayStart: new Date('2026-07-15T00:00:00.000Z'),
      monthEnd: new Date('2026-07-31T23:59:59.999Z'),
      commitmentsEnd: new Date('2026-08-13T23:59:59.999Z'),
      daysRemainingInMonth: 17,
    });
    assert.equal(getUtcDashboardBoundaries(new Date('2026-07-31T23:59:59.000Z')).daysRemainingInMonth, 1);
    assert.equal(getUtcDashboardBoundaries(new Date('2028-02-10T12:00:00.000Z')).daysRemainingInMonth, 20);
  });
});

describe('DashboardOverviewService composition', () => {
  it('reuses the 30-day forecast for total balance and forecast fields', async () => {
    const context = harness({ currentBalance: '4800.00' });
    const result = await context.service.getOverview('owner', { asOf: asOf.toISOString() });
    assert.deepEqual(context.calls.forecast, {
      userId: 'owner', query: { asOf: asOf.toISOString(), horizonDays: 30 },
    });
    assert.equal(result.balance.total, '4800.00');
    assert.deepEqual(result.forecast30Days, {
      projectedFinalBalance: '800.00', minimumProjectedBalance: '700.00', firstNegativeDate: null,
    });
  });

  it('sums open, closed, overdue invoices through month end and excludes canceled installments', async () => {
    const context = harness({
      invoices: [
        invoice({ id: 'overdue', dueDate: new Date('2026-06-01T00:00:00.000Z'), status: 'overdue', installments: [installment(10), installment(99, 'canceled')] }),
        invoice({ id: 'closed', status: 'closed', installments: [installment(20)] }),
        invoice({ id: 'future', dueDate: new Date('2026-08-01T00:00:00.000Z'), installments: [installment(1000)] }),
      ],
    });
    const result = await context.service.getOverview('owner', { asOf: asOf.toISOString() });
    assert.equal(result.balance.committed, '30.00');
    assert.deepEqual(context.calls.invoices.where.status.in, ['open', 'closed', 'overdue']);
    assert.equal(result.nextInvoice?.id, 'overdue');
    assert.equal(result.nextInvoice?.amount, '10.00');
    assert.equal(result.nextInvoice?.installmentsCount, 1);
  });

  it('includes only pending active expense occurrences through month end', async () => {
    const context = harness({ occurrences: [{ amount: decimal('40.40') }] });
    const result = await context.service.getOverview('owner', { asOf: asOf.toISOString() });
    assert.equal(result.balance.committed, '40.40');
    assert.deepEqual(context.calls.occurrences.where, {
      userId: 'owner', type: 'expense', status: 'pending',
      occurrenceDate: { lte: new Date('2026-07-31T23:59:59.999Z') },
      fixedExpense: { is: { isActive: true } },
    });
  });

  it('includes only confirmed expense events through month end', async () => {
    const context = harness({ events: [{ expectedAmount: decimal('50.50') }] });
    const result = await context.service.getOverview('owner', { asOf: asOf.toISOString() });
    assert.equal(result.balance.committed, '50.50');
    assert.deepEqual(context.calls.events.where, {
      userId: 'owner', type: 'expense', status: 'confirmed',
      date: { lte: new Date('2026-07-31T23:59:59.999Z') },
    });
  });

  it('does not double count invoice installments, occurrences, or events', async () => {
    const context = harness({
      invoices: [invoice({ installments: [installment(10), installment(20)] })],
      occurrences: [{ amount: decimal(30) }], events: [{ expectedAmount: decimal(40) }],
    });
    const result = await context.service.getOverview('owner', { asOf: asOf.toISOString() });
    assert.equal(result.balance.committed, '100.00');
    assert.equal(context.calls.invoices.select.installments.select.installmentAmount, true);
  });

  it('sums spending today only through exact asOf and only on active accounts', async () => {
    const context = harness({ spentToday: decimal('41.40'), currentBalance: '2150.00' });
    const result = await context.service.getOverview('owner', { asOf: asOf.toISOString() });
    assert.deepEqual(context.calls.spentToday.where.occurredAt, {
      gte: new Date('2026-07-15T00:00:00.000Z'), lte: asOf,
    });
    assert.deepEqual(context.calls.spentToday.where.account.is, { userId: 'owner', isActive: true });
    assert.equal(result.dailySpending.spentToday, '41.40');
    assert.equal(result.dailySpending.status, 'within_plan');
  });

  it('selects the oldest overdue invoice, the next invoice, or null', async () => {
    const overdue = harness({ invoices: [invoice({ id: 'old', dueDate: new Date('2026-06-01T00:00:00.000Z') }), invoice({ id: 'next' })] });
    assert.equal((await overdue.service.getOverview('owner', { asOf: asOf.toISOString() })).nextInvoice?.id, 'old');
    const upcoming = harness({ invoices: [invoice({ id: 'next' })] });
    assert.equal((await upcoming.service.getOverview('owner', { asOf: asOf.toISOString() })).nextInvoice?.id, 'next');
    assert.equal((await harness().service.getOverview('owner', { asOf: asOf.toISOString() })).nextInvoice, null);
    assert.deepEqual(overdue.calls.invoices.orderBy, [{ dueDate: 'asc' }, { id: 'asc' }]);
  });

  it('returns five ordered projected commitments and excludes invoices', async () => {
    const items = [
      ...Array.from({ length: 6 }, (_, index) => timelineItem(index)),
      timelineItem(7, { sourceType: 'credit_card_invoice' }),
      timelineItem(8, { balanceImpact: 'realized' }),
    ];
    const context = harness({ timelineItems: items });
    const result = await context.service.getOverview('owner', { asOf: asOf.toISOString() });
    assert.deepEqual(result.upcomingCommitments.map((item) => item.id), ['item-0', 'item-1', 'item-2', 'item-3', 'item-4']);
    assert.equal(context.calls.timeline.query.startDate, '2026-07-15T00:00:00.000Z');
    assert.equal(context.calls.timeline.query.endDate, '2026-08-13T23:59:59.999Z');
    assert.equal(context.calls.timeline.options.referenceDate.toISOString(), asOf.toISOString());
  });

  it('returns the latest five transactions with active account and user isolation', async () => {
    const context = harness({ transactions: Array.from({ length: 5 }, (_, index) => transaction(index)) });
    const result = await context.service.getOverview('owner', { asOf: asOf.toISOString() });
    assert.equal(result.latestTransactions.length, 5);
    assert.equal(result.latestTransactions[0].amount, '0.10');
    assert.deepEqual(context.calls.latestTransactions.where, {
      userId: 'owner', occurredAt: { lte: asOf },
      account: { is: { userId: 'owner', isActive: true } },
    });
    assert.deepEqual(context.calls.latestTransactions.orderBy, [{ occurredAt: 'desc' }, { id: 'desc' }]);
    assert.equal(context.calls.latestTransactions.take, 5);
    for (const key of ['invoices', 'occurrences', 'events']) assert.equal(context.calls[key].where.userId, 'owner');
  });
});

describe('GetDashboardOverviewDto', () => {
  it('accepts absent or ISO asOf and rejects invalid dates', async () => {
    assert.equal((await validate(plainToInstance(GetDashboardOverviewDto, {}))).length, 0);
    assert.equal((await validate(plainToInstance(GetDashboardOverviewDto, { asOf: asOf.toISOString() }))).length, 0);
    assert.ok((await validate(plainToInstance(GetDashboardOverviewDto, { asOf: 'invalid' }))).length > 0);
  });
});
