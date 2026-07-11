import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FixedOccurrencesService } from './fixed-occurrences.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const occurrence = (overrides: Record<string, unknown> = {}): any => ({
  id: 'occurrence', userId: 'user', type: 'expense', status: 'pending',
  fixedExpenseId: 'template', fixedIncomeId: null, name: 'Rent', amount: decimal('100.25'),
  occurrenceDate: new Date('2026-08-10T00:00:00.000Z'), year: 2026, month: 8,
  categoryId: 'category', accountId: 'account', paymentMethod: 'pix',
  realizedTransactionId: null, realizedAt: null,
  fixedExpense: { accountId: 'template-account', categoryId: 'template-category', paymentMethod: 'cash' },
  fixedIncome: null, ...overrides,
});

function harness(options: Record<string, any> = {}) {
  const state = { occurrence: occurrence(options.occurrence), transactions: [] as any[], attempts: 0, transactionOptions: [] as any[] };
  const tx: any = {
    fixedOccurrence: {
      findFirst: async ({ where }: any) => state.occurrence.id === where.id && state.occurrence.userId === where.userId ? state.occurrence : null,
      update: async ({ data }: any) => {
        if (options.failUpdate) throw new Error('update failed');
        Object.assign(state.occurrence, data); return state.occurrence;
      },
    },
    account: { findFirst: async ({ where }: any) => options.accountValid === false || where.userId !== 'user' || where.isActive !== true ? null : { id: where.id } },
    category: { findFirst: async ({ where }: any) => options.categoryValid === false || where.userId !== 'user' ? null : { id: where.id } },
    transaction: { create: async ({ data }: any) => {
      if (options.failCreate) throw new Error('create failed');
      const value = { id: `transaction-${state.transactions.length + 1}`, ...data };
      state.transactions.push(value); return value;
    } },
  };
  const prisma: any = {
    fixedOccurrence: tx.fixedOccurrence,
    $transaction: async (operation: any, transactionOptions: any) => {
      state.attempts += 1; state.transactionOptions.push(transactionOptions);
      if (state.attempts <= (options.serializationFailures ?? 0)) {
        throw new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: '7.8.0' });
      }
      const before = { ...state.occurrence };
      const count = state.transactions.length;
      try { return await operation(tx); } catch (error) {
        state.occurrence = before; state.transactions.splice(count); throw error;
      }
    },
  };
  return { service: new FixedOccurrencesService(prisma), state };
}

describe('FixedOccurrencesService realization', () => {
  it('creates one correct transaction and records its id atomically', async () => {
    const context = harness();
    const result = await context.service.realize('user', 'occurrence', {});
    assert.equal(context.state.transactions.length, 1);
    assert.deepEqual(context.state.transactions[0], {
      id: 'transaction-1', userId: 'user', type: 'expense', amount: decimal('100.25'),
      description: 'Rent', accountId: 'account', categoryId: 'category', paymentMethod: 'pix',
      occurredAt: context.state.transactions[0].occurredAt, source: 'app',
    });
    assert.equal(result.occurrence.realizedTransactionId, 'transaction-1');
    assert.equal(result.occurrence.status, 'realized');
    assert.equal(context.state.transactionOptions[0].isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  });

  it('accepts payload overrides including occurredAt', async () => {
    const context = harness();
    await context.service.realize('user', 'occurrence', {
      accountId: 'override-account', categoryId: 'override-category', paymentMethod: 'transfer', occurredAt: '2026-08-10T14:30:00.000Z',
    });
    assert.equal(context.state.transactions[0].accountId, 'override-account');
    assert.equal(context.state.transactions[0].categoryId, 'override-category');
    assert.equal(context.state.transactions[0].paymentMethod, 'transfer');
    assert.equal(context.state.transactions[0].occurredAt.toISOString(), '2026-08-10T14:30:00.000Z');
  });

  it('rejects archived/foreign accounts and foreign or incompatible categories', async () => {
    await assert.rejects(() => harness({ accountValid: false }).service.realize('user', 'occurrence', {}), BadRequestException);
    await assert.rejects(() => harness({ categoryValid: false }).service.realize('user', 'occurrence', {}), BadRequestException);
  });

  it('rejects credit payment method', async () => {
    await assert.rejects(() => harness().service.realize('user', 'occurrence', { paymentMethod: 'credit' as any }), BadRequestException);
  });

  it('returns conflict for duplicate realization', async () => {
    const context = harness({ occurrence: { status: 'realized', realizedTransactionId: 'transaction' } });
    await assert.rejects(() => context.service.realize('user', 'occurrence', {}), ConflictException);
    assert.equal(context.state.transactions.length, 0);
  });

  it('rolls back transaction creation when occurrence update fails', async () => {
    const context = harness({ failUpdate: true });
    await assert.rejects(() => context.service.realize('user', 'occurrence', {}), /update failed/);
    assert.equal(context.state.transactions.length, 0);
    assert.equal(context.state.occurrence.status, 'pending');
  });

  it('retries P2034 at most until success', async () => {
    const context = harness({ serializationFailures: 2 });
    await context.service.realize('user', 'occurrence', {});
    assert.equal(context.state.attempts, 3);
    assert.equal(context.state.transactions.length, 1);
  });
});

describe('FixedOccurrencesService cancellation', () => {
  it('cancels pending occurrence without creating a transaction', async () => {
    const context = harness();
    const result = await context.service.cancel('user', 'occurrence');
    assert.equal(result.status, 'canceled');
    assert.equal(context.state.transactions.length, 0);
  });

  it('does not cancel realized or already canceled occurrences', async () => {
    await assert.rejects(() => harness({ occurrence: { status: 'realized' } }).service.cancel('user', 'occurrence'), ConflictException);
    await assert.rejects(() => harness({ occurrence: { status: 'canceled' } }).service.cancel('user', 'occurrence'), ConflictException);
  });
});
