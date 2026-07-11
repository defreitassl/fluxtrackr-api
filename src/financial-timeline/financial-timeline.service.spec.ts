import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinancialTimelineService } from './financial-timeline.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);

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
    fixedExpense: model('fixedExpense'),
    fixedIncome: model('fixedIncome'),
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
      'fixedExpense',
      'fixedIncome',
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
    assert.deepEqual(where.status.in, ['planned', 'postponed', 'canceled']);
  });

  it('excludes realized or converted events in the Prisma query', async () => {
    const context = harness();
    await context.service.findMany('user', query());
    const where = context.calls.financialEvent[0].where;
    assert.deepEqual(where.status.in, ['planned', 'postponed']);
    assert.equal(where.confirmedTransactionId, null);
    assert.equal(where.confirmedCreditCardPurchaseId, null);
  });
});

describe('FinancialTimelineService aggregation', () => {
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

  it('generates fixed income and expense occurrences and clamps short months', async () => {
    const context = harness({
      fixedExpense: [{ id: 'expense', name: 'Rent', amount: decimal(900), dueDay: 31 }],
      fixedIncome: [{ id: 'income', name: 'Salary', amount: decimal(5000), receiveDay: 30 }],
    });
    const result = await context.service.findMany('user', query());
    const expenseDates = result.items
      .filter((item) => item.sourceType === 'fixed_expense')
      .map((item) => item.date);
    const incomeDates = result.items
      .filter((item) => item.sourceType === 'fixed_income')
      .map((item) => item.date);
    assert.deepEqual(expenseDates, [
      '2099-02-28T00:00:00.000Z',
      '2099-03-31T00:00:00.000Z',
    ]);
    assert.deepEqual(incomeDates, [
      '2099-02-28T00:00:00.000Z',
      '2099-03-30T00:00:00.000Z',
    ]);
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
      fixedIncome: [{ id: 'salary', name: 'Salary', amount: decimal(5000), receiveDay: 20 }],
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
