import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinancialTimelineService } from './financial-timeline.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const occurrence = (type: 'expense' | 'income', overrides: Record<string, unknown> = {}): any => ({
  id: `${type}-occurrence`, userId: 'user', type, status: 'pending',
  fixedExpenseId: type === 'expense' ? 'expense-template' : null,
  fixedIncomeId: type === 'income' ? 'income-template' : null,
  name: type === 'expense' ? 'Rent' : 'Salary', amount: decimal(type === 'expense' ? 900 : 5000),
  occurrenceDate: new Date('2099-02-10T00:00:00.000Z'), year: 2099, month: 2,
  categoryId: null, accountId: null, paymentMethod: 'pix', realizedTransactionId: null,
  ...overrides,
});

function harness(data: Record<string, any[]> = {}) {
  const calls: Record<string, any[]> = {};
  const model = (name: string) => ({
    findMany: async (args: any) => {
      (calls[name] ??= []).push(args);
      return data[name] ?? [];
    },
  });
  const prisma = {
    transaction: model('transaction'),
    financialEvent: model('financialEvent'),
    creditCardInvoice: model('creditCardInvoice'),
    fixedOccurrence: model('fixedOccurrence'),
    subscriptionCharge: model('subscriptionCharge'),
    accountTransfer: model('accountTransfer'),
    accountBalanceAdjustment: model('accountBalanceAdjustment'),
  };
  return {
    service: new FinancialTimelineService(prisma as any),
    calls,
  };
}

const query = (overrides: Record<string, unknown> = {}): any => ({
  startDate: '2099-02-01T00:00:00.000Z',
  endDate: '2099-03-31T23:59:59.999Z',
  includeCanceled: false,
  ...overrides,
});

describe('FinancialTimelineService range and queries', () => {
  it('isolates every source by authenticated user', async () => {
    const context = harness();
    await context.service.findMany('user-1', query());
    for (const source of [
      'transaction',
      'financialEvent',
      'creditCardInvoice',
      'fixedOccurrence',
      'subscriptionCharge',
      'accountTransfer',
      'accountBalanceAdjustment',
    ]) {
      assert.equal(context.calls[source][0].where.userId, 'user-1');
    }
  });

  it('rejects inverted ranges and ranges longer than 366 days', async () => {
    const service = harness().service;
    await assert.rejects(
      () =>
        service.findMany(
          'user',
          query({
            startDate: '2099-03-01T00:00:00.000Z',
            endDate: '2099-02-01T00:00:00.000Z',
          }),
        ),
      BadRequestException,
    );
    await assert.rejects(
      () =>
        service.findMany(
          'user',
          query({
            startDate: '2099-01-01T00:00:00.000Z',
            endDate: '2100-01-03T00:00:00.001Z',
          }),
        ),
      /cannot exceed 366 days/,
    );
  });

  it('applies type, sourceType, and canceled filters', async () => {
    const context = harness();
    await context.service.findMany(
      'user',
      query({ type: 'expense', sourceType: 'financial_event', includeCanceled: true }),
    );
    assert.deepEqual(Object.keys(context.calls), ['financialEvent']);
    const where = context.calls.financialEvent[0].where;
    assert.equal(where.type, 'expense');
    assert.deepEqual(where.status.in, ['planned', 'confirmed', 'postponed', 'canceled']);
  });

  it('excludes realized or converted events in the Prisma query', async () => {
    const context = harness();
    await context.service.findMany('user', query());
    const where = context.calls.financialEvent[0].where;
    assert.deepEqual(where.status.in, ['planned', 'confirmed', 'postponed']);
    assert.equal(where.confirmedTransactionId, null);
    assert.equal(where.confirmedCreditCardPurchaseId, null);
  });

  it('queries only pending active-template occurrences and never realized occurrences', async () => {
    const context = harness();
    await context.service.findMany('user', query());
    const where = context.calls.fixedOccurrence[0].where;
    assert.deepEqual(where.status.in, ['pending']);
    assert.ok(where.OR.some((entry: any) => entry.fixedExpense?.is?.isActive === true));
    assert.ok(where.OR.some((entry: any) => entry.fixedIncome?.is?.isActive === true));
  });
});

describe('FinancialTimelineService aggregation', () => {
  it('shows transfers and adjustments once as informational without changing summaries', async () => {
    const context = harness({
      accountTransfer: [{
        id: 'transfer', sourceAccountId: 'source', destinationAccountId: 'destination',
        amount: decimal(250), description: 'Reserve', occurredAt: new Date('2099-02-15T10:00:00.000Z'),
      }],
      accountBalanceAdjustment: [{
        id: 'adjustment', accountId: 'account', previousBalance: decimal(100),
        newBalance: decimal(150), difference: decimal(50), reason: 'Conference',
        occurredAt: new Date('2099-02-16T10:00:00.000Z'),
      }],
    });
    const result = await context.service.findMany('user', query());
    const transfer = result.items.find((item) => item.id === 'transfer')!;
    const adjustment = result.items.find((item) => item.id === 'adjustment')!;
    assert.equal(transfer.type, 'transfer');
    assert.equal(adjustment.type, 'adjustment');
    assert.equal(transfer.balanceImpact, 'informational');
    assert.equal(adjustment.balanceImpact, 'informational');
    assert.deepEqual(result.summary, {
      realizedIncome: '0.00', realizedExpense: '0.00', projectedIncome: '0.00', projectedExpense: '0.00',
    });
  });
  it('includes confirmed events as projected and excludes realized linked events', async () => {
    const context = harness({
      financialEvent: [{
        id: 'confirmed', type: 'expense', name: 'Confirmed', expectedAmount: decimal(30),
        date: new Date('2099-02-10T00:00:00.000Z'), status: 'confirmed', accountId: 'account',
        creditCardId: null, categoryId: null, recurrence: 'once', installmentCount: 1,
      }],
    });
    const result = await context.service.findMany('user', query());
    assert.equal(result.items[0].status, 'confirmed');
    assert.equal(result.items[0].balanceImpact, 'projected');
    assert.equal(result.summary.projectedExpense, '30.00');
    const where = context.calls.financialEvent[0].where;
    assert.equal(where.confirmedTransactionId, null);
    assert.equal(where.confirmedCreditCardPurchaseId, null);
  });

  it('reads persisted historical and future fixed occurrences', async () => {
    const context = harness({
      fixedOccurrence: [occurrence('expense'), occurrence('income')],
    });
    const historical = await context.service.findMany('user', {
      startDate: '2020-01-01T00:00:00.000Z', endDate: '2020-01-31T23:59:59.999Z', includeCanceled: false,
    }, { referenceDate: new Date('2020-01-03T15:00:00.000Z') });
    assert.equal(historical.items.length, 2);
    const future = await context.service.findMany('user', {
      startDate: '2100-01-01T00:00:00.000Z', endDate: '2100-01-31T23:59:59.999Z', includeCanceled: false,
    }, { referenceDate: new Date('2099-12-15T12:00:00.000Z') });
    assert.equal(future.items.filter((entry) => entry.sourceType.startsWith('fixed_')).length, 2);
  });

  it('orders chronologically and breaks ties by sourceType and id', async () => {
    const context = harness({
      transaction: [
        {
          id: 'z', type: 'expense', amount: decimal(10), description: 'Later',
          occurredAt: new Date('2099-03-02T00:00:00.000Z'), accountId: null,
          categoryId: null, paymentMethod: null, source: 'app',
        },
        {
          id: 'b', type: 'income', amount: decimal(20), description: 'Tie transaction',
          occurredAt: new Date('2099-03-01T00:00:00.000Z'), accountId: null,
          categoryId: null, paymentMethod: null, source: 'app',
        },
      ],
      financialEvent: [{
        id: 'a', type: 'expense', name: 'Tie event', expectedAmount: decimal(5),
        date: new Date('2099-03-01T00:00:00.000Z'), status: 'planned',
        accountId: 'account', creditCardId: null, categoryId: null,
        recurrence: 'once', installmentCount: 1,
      }],
    });
    const result = await context.service.findMany('user', query());
    assert.deepEqual(result.items.map((item) => item.id), ['a', 'b', 'z']);
  });

  it('groups an invoice, excludes canceled installments, and makes paid invoices informational', async () => {
    const context = harness({
      creditCardInvoice: [{
        id: 'invoice', creditCardId: 'card', accountId: 'account', month: 3, year: 2099,
        dueDate: new Date('2099-03-07T00:00:00.000Z'), status: 'paid',
        creditCard: { id: 'card', name: 'Nubank', bankName: 'Nubank', brand: 'Mastercard', lastFourDigits: '1234' },
        installments: [
          { installmentAmount: decimal('100.10'), status: 'paid' },
          { installmentAmount: decimal('50.00'), status: 'canceled' },
          { installmentAmount: decimal('20.20'), status: 'paid' },
        ],
      }],
    });
    const result = await context.service.findMany('user', query());
    const invoice = result.items.find((item) => item.sourceType === 'credit_card_invoice')!;
    assert.equal(invoice.amount, '120.30');
    assert.equal(invoice.balanceImpact, 'informational');
    assert.equal(invoice.metadata.installmentCount, 2);
    assert.equal(result.summary.projectedExpense, '0.00');
  });

  it('maps fixed income and expense occurrences with snapshot metadata', async () => {
    const context = harness({
      fixedOccurrence: [occurrence('expense'), occurrence('income')],
    });
    const result = await context.service.findMany('user', query());
    const expenseDates = result.items
      .filter((item) => item.sourceType === 'fixed_expense')
      .map((item) => item.date);
    const incomeDates = result.items
      .filter((item) => item.sourceType === 'fixed_income')
      .map((item) => item.date);
    assert.deepEqual(expenseDates, ['2099-02-10T00:00:00.000Z']);
    assert.deepEqual(incomeDates, ['2099-02-10T00:00:00.000Z']);
    assert.equal(result.items[0].metadata.occurrenceId, 'expense-occurrence');
  });

  it('shows canceled occurrences only when requested with no balance impact', async () => {
    const hidden = harness();
    await hidden.service.findMany('user', query());
    assert.deepEqual(hidden.calls.fixedOccurrence[0].where.status.in, ['pending']);
    const visible = harness({ fixedOccurrence: [occurrence('expense', { status: 'canceled' })] });
    const result = await visible.service.findMany('user', query({ includeCanceled: true }));
    assert.equal(result.items[0].status, 'canceled');
    assert.equal(result.items[0].balanceImpact, 'none');
  });

  it('summarizes realized and projected values without duplicating converted events', async () => {
    const context = harness({
      transaction: [
        {
          id: 'transaction', type: 'expense', amount: decimal(250), description: 'Market',
          occurredAt: new Date('2099-02-05T12:00:00.000Z'), accountId: 'account',
          categoryId: 'category', paymentMethod: 'pix', source: 'app',
        },
        {
          id: 'income', type: 'income', amount: decimal(100), description: 'Refund',
          occurredAt: new Date('2099-02-06T12:00:00.000Z'), accountId: 'account',
          categoryId: null, paymentMethod: 'pix', source: 'app',
        },
      ],
      financialEvent: [{
        id: 'planned', type: 'expense', name: 'Insurance', expectedAmount: decimal(300),
        date: new Date('2099-02-10T00:00:00.000Z'), status: 'planned', accountId: 'account',
        creditCardId: null, categoryId: null, recurrence: 'once', installmentCount: 1,
      }],
      fixedOccurrence: [occurrence('income', { amount: decimal(5000), name: 'Salary' })],
    });
    const result = await context.service.findMany('user', query({ endDate: '2099-02-28T23:59:59.999Z' }));
    assert.equal(result.items.filter((item) => item.id === 'transaction').length, 1);
    assert.deepEqual(result.summary, {
      realizedIncome: '100.00',
      realizedExpense: '250.00',
      projectedIncome: '5000.00',
      projectedExpense: '300.00',
    });
  });
});
