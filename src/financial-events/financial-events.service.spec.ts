import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinancialEventsService } from './financial-events.service';

const baseEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'event-1',
  userId: 'user',
  type: 'expense',
  name: 'Insurance',
  expectedAmount: new Prisma.Decimal('1200.00'),
  date: new Date('2026-08-15T12:00:00.000Z'),
  categoryId: 'category',
  accountId: 'account',
  creditCardId: null,
  paymentMethod: 'pix',
  recurrence: 'once',
  installmentCount: 1,
  status: 'planned',
  notes: null,
  confirmedTransactionId: null,
  confirmedCreditCardPurchaseId: null,
  ...overrides,
});

function cloneEvent(event: any) {
  return {
    ...event,
    expectedAmount: new Prisma.Decimal(event.expectedAmount),
    date: new Date(event.date),
  };
}

function harness(options: {
  events?: any[];
  categoryValid?: boolean;
  accountValid?: boolean;
  cardValid?: boolean;
  failRealizedUpdate?: boolean;
  failPurchase?: boolean;
} = {}) {
  const state = {
    events: (options.events ?? [baseEvent()]).map(cloneEvent),
    transactions: [] as any[],
    purchaseCalls: [] as any[],
    lastListWhere: null as any,
  };
  const financialEvent = {
    findFirst: async ({ where }: any) =>
      state.events.find(
        (event) => event.id === where.id && event.userId === where.userId,
      ) ?? null,
    findMany: async ({ where }: any) => {
      state.lastListWhere = where;
      return state.events.filter((event) => event.userId === where.userId);
    },
    create: async ({ data }: any) => {
      const event = baseEvent({ id: `event-${state.events.length + 1}`, ...data });
      state.events.push(event);
      return event;
    },
    update: async ({ where, data }: any) => {
      if (options.failRealizedUpdate && data.status === 'realized') {
        throw new Error('realized update failed');
      }
      const event = state.events.find((item) => item.id === where.id);
      if (!event) throw new Error('event missing');
      Object.assign(event, data);
      return event;
    },
  };
  const tx = {
    financialEvent,
    category: {
      findFirst: async () => options.categoryValid === false ? null : { id: 'category' },
    },
    account: {
      findFirst: async () => options.accountValid === false ? null : { id: 'account' },
    },
    creditCard: {
      findFirst: async () => options.cardValid === false ? null : { id: 'card', closingDay: 25 },
    },
    transaction: {
      create: async ({ data }: any) => {
        const transaction = { id: `transaction-${state.transactions.length + 1}`, ...data };
        state.transactions.push(transaction);
        return transaction;
      },
    },
  };
  const prisma = {
    financialEvent,
    $transaction: async (operation: any) => {
      const eventsSnapshot = state.events.map(cloneEvent);
      const transactionCount = state.transactions.length;
      try {
        return await operation(tx);
      } catch (error) {
        state.events.splice(0, state.events.length, ...eventsSnapshot);
        state.transactions.splice(transactionCount);
        throw error;
      }
    },
  };
  const purchaseDomain = {
    create: async (_tx: any, userId: string, input: any) => {
      state.purchaseCalls.push({ userId, input });
      if (options.failPurchase) throw new Error('purchase failed');
      return { id: 'purchase', installmentCount: input.installmentCount };
    },
  };
  return {
    service: new FinancialEventsService(prisma as any, purchaseDomain as any),
    state,
  };
}

const createDto = (overrides: Record<string, unknown> = {}): any => ({
  type: 'expense' as const,
  name: 'Insurance',
  expectedAmount: 1200,
  date: '2026-08-15T12:00:00.000Z',
  categoryId: 'category',
  accountId: 'account',
  paymentMethod: 'pix' as const,
  recurrence: 'once' as const,
  installmentCount: 1,
  ...overrides,
});

describe('FinancialEventsService CRUD and validation', () => {
  it('creates, lists, updates, cancels, and isolates events by user', async () => {
    const context = harness({ events: [] });
    const created = await context.service.create('user', createDto());
    assert.equal(created.userId, 'user');
    const listed = await context.service.findMany('user', {
      type: 'expense' as any,
      status: 'planned' as any,
      accountId: 'account',
    });
    assert.equal(listed.length, 1);
    assert.equal(context.state.lastListWhere.userId, 'user');
    const updated = await context.service.update('user', created.id, { name: 'Updated' });
    assert.equal(updated.name, 'Updated');
    const canceled = await context.service.remove('user', created.id);
    assert.equal(canceled.status, 'canceled');
    await assert.rejects(() => context.service.findOne('other', created.id), NotFoundException);
    await assert.rejects(() => context.service.update('user', created.id, { name: 'Again' }), BadRequestException);
  });

  it('rejects income without account and expense with account plus card', async () => {
    const context = harness({ events: [] });
    await assert.rejects(
      () => context.service.create('user', createDto({ type: 'income', accountId: undefined })),
      BadRequestException,
    );
    await assert.rejects(
      () => context.service.create('user', createDto({ creditCardId: 'card' })),
      BadRequestException,
    );
  });

  it('rejects incompatible category and archived card', async () => {
    await assert.rejects(
      () => harness({ events: [], categoryValid: false }).service.create('user', createDto()),
      BadRequestException,
    );
    await assert.rejects(
      () => harness({ events: [], cardValid: false }).service.create('user', createDto({ accountId: undefined, creditCardId: 'card' })),
      BadRequestException,
    );
  });

  it('postpones mutable events and blocks canceled or realized events', async () => {
    const context = harness();
    const postponed = await context.service.postpone('user', 'event-1', {
      date: '2026-09-15T12:00:00.000Z',
    });
    assert.equal(postponed.status, 'postponed');
    assert.equal(postponed.date.toISOString(), '2026-09-15T12:00:00.000Z');
    context.state.events[0].status = 'realized';
    await assert.rejects(
      () => context.service.postpone('user', 'event-1', { date: '2026-10-15T12:00:00.000Z' }),
      BadRequestException,
    );
  });
});

describe('FinancialEventsService confirmation', () => {
  it('creates a Transaction and realizes an account event', async () => {
    const context = harness();
    const result = await context.service.confirm('user', 'event-1');
    assert.equal(result.event.status, 'realized');
    assert.equal(result.event.confirmedTransactionId, 'transaction-1');
    assert.equal(result.transaction.type, 'expense');
    assert.equal(result.transaction.amount.toFixed(2), '1200.00');
    assert.equal(result.transaction.accountId, 'account');
    assert.equal(result.transaction.paymentMethod, 'pix');
    assert.equal(result.transaction.source, 'app');
    assert.equal(result.transaction.occurredAt.toISOString(), '2026-08-15T12:00:00.000Z');
  });

  it('creates a parcelled credit card purchase through the shared domain', async () => {
    const event = baseEvent({
      accountId: null,
      creditCardId: 'card',
      paymentMethod: null,
      installmentCount: 12,
    });
    const context = harness({ events: [event] });
    const result = await context.service.confirm('user', 'event-1');
    assert.equal(result.event.confirmedCreditCardPurchaseId, 'purchase');
    assert.equal(result.creditCardPurchase.installmentCount, 12);
    assert.equal(context.state.purchaseCalls[0].input.installmentCount, 12);
    assert.equal(context.state.transactions.length, 0);
  });

  it('returns conflict for duplicate confirmation', async () => {
    const context = harness();
    await context.service.confirm('user', 'event-1');
    await assert.rejects(
      () => context.service.confirm('user', 'event-1'),
      ConflictException,
    );
    assert.equal(context.state.transactions.length, 1);
  });

  it('does not confirm canceled events', async () => {
    const context = harness({ events: [baseEvent({ status: 'canceled' })] });
    await assert.rejects(
      () => context.service.confirm('user', 'event-1'),
      BadRequestException,
    );
    assert.equal(context.state.transactions.length, 0);
  });

  it('creates the next planned occurrence for supported recurrences', async () => {
    for (const [recurrence, expected] of [
      ['monthly', '2026-09-15T12:00:00.000Z'],
      ['semiannual', '2027-02-15T12:00:00.000Z'],
      ['yearly', '2027-08-15T12:00:00.000Z'],
    ] as const) {
      const context = harness({ events: [baseEvent({ recurrence })] });
      const result = await context.service.confirm('user', 'event-1');
      assert.ok(result.nextEvent);
      assert.equal(result.nextEvent.status, 'planned');
      assert.equal(result.nextEvent.date.toISOString(), expected);
    }
  });

  it('rolls back when transaction finalization or purchase creation fails', async () => {
    const accountContext = harness({ failRealizedUpdate: true });
    await assert.rejects(
      () => accountContext.service.confirm('user', 'event-1'),
      /realized update failed/,
    );
    assert.equal(accountContext.state.transactions.length, 0);
    assert.equal(accountContext.state.events[0].status, 'planned');

    const cardContext = harness({
      failPurchase: true,
      events: [baseEvent({ accountId: null, creditCardId: 'card', paymentMethod: null })],
    });
    await assert.rejects(
      () => cardContext.service.confirm('user', 'event-1'),
      /purchase failed/,
    );
    assert.equal(cardContext.state.events[0].status, 'planned');
  });
});
