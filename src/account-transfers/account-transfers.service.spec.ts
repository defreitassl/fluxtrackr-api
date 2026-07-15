import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountTransfersService } from './account-transfers.service';

const dto = (overrides: Record<string, unknown> = {}): any => ({
  sourceAccountId: '00000000-0000-4000-8000-000000000001',
  destinationAccountId: '00000000-0000-4000-8000-000000000002',
  amount: '250.00', description: 'Reserva', occurredAt: '2026-07-15T14:00:00.000Z',
  ...overrides,
});

function harness(options: Record<string, any> = {}) {
  const state = { transfers: [] as any[], attempts: 0, transactionOptions: [] as any[], accountQuery: null as any };
  const tx: any = {
    account: { findMany: async (args: any) => {
      state.accountQuery = args;
      return options.validAccounts === false ? [{ id: dto().sourceAccountId }] : [{ id: dto().sourceAccountId }, { id: dto().destinationAccountId }];
    } },
    accountTransfer: { create: async ({ data }: any) => {
      if (options.failCreate) throw new Error('create failed');
      const transfer = { id: 'transfer', ...data }; state.transfers.push(transfer); return transfer;
    } },
  };
  const prisma: any = {
    accountTransfer: { findMany: async () => state.transfers, findFirst: async () => state.transfers[0] ?? null },
    $transaction: async (operation: any, transactionOptions: any) => {
      state.attempts += 1; state.transactionOptions.push(transactionOptions);
      if (state.attempts <= (options.serializationFailures ?? 0)) {
        throw new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: '7.8.0' });
      }
      const count = state.transfers.length;
      try { return await operation(tx); } catch (error) { state.transfers.splice(count); throw error; }
    },
  };
  return { service: new AccountTransfersService(prisma, options.now ?? (() => new Date('2026-07-15T14:00:00.000Z'))), state };
}

describe('AccountTransfersService', () => {
  it('creates a valid transfer without checking source balance', async () => {
    const context = harness();
    const transfer = await context.service.create('user', dto());
    assert.equal(transfer.amount.toFixed(2), '250.00');
    assert.equal(context.state.transfers.length, 1);
    assert.deepEqual(context.state.accountQuery.where, {
      id: { in: [dto().sourceAccountId, dto().destinationAccountId] }, userId: 'user', isActive: true,
    });
    assert.equal(context.state.transactionOptions[0].isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  });

  it('rejects equal, inactive/foreign accounts and non-positive amounts', async () => {
    await assert.rejects(() => harness().service.create('user', dto({ destinationAccountId: dto().sourceAccountId })), BadRequestException);
    await assert.rejects(() => harness({ validAccounts: false }).service.create('user', dto()), BadRequestException);
    await assert.rejects(() => harness().service.create('user', dto({ amount: '0' })), BadRequestException);
    await assert.rejects(() => harness().service.create('user', dto({ amount: '-1' })), BadRequestException);
  });

  it('rejects future transfers and permits past transfers with a controlled clock', async () => {
    const context = harness({ now: () => new Date('2026-07-15T14:00:00.000Z') });
    await assert.rejects(() => context.service.create('user', dto({ occurredAt: '2026-07-15T14:00:00.001Z' })), BadRequestException);
    const past = await context.service.create('user', dto({ occurredAt: '2026-07-15T13:59:59.999Z' }));
    assert.equal(past.occurredAt.toISOString(), '2026-07-15T13:59:59.999Z');
  });

  it('rolls back failures and retries P2034', async () => {
    const failed = harness({ failCreate: true });
    await assert.rejects(() => failed.service.create('user', dto()), /create failed/);
    assert.equal(failed.state.transfers.length, 0);
    const retried = harness({ serializationFailures: 2 });
    await retried.service.create('user', dto());
    assert.equal(retried.state.attempts, 3);
    assert.equal(retried.state.transfers.length, 1);
    const exhausted = harness({ serializationFailures: 3 });
    await assert.rejects(() => exhausted.service.create('user', dto()), ConflictException);
  });
});
