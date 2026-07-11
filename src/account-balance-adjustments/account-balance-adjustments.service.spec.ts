import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountBalanceAdjustmentsService } from './account-balance-adjustments.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);

function harness(options: Record<string, any> = {}) {
  const state = { adjustments: [] as any[], attempts: 0, balanceCalls: [] as any[] };
  const tx: any = {
    account: { findFirst: async ({ where }: any) => options.accountValid === false || where.isActive !== true ? null : { id: 'account' } },
    accountBalanceAdjustment: { create: async ({ data }: any) => {
      if (options.failCreate) throw new Error('create failed');
      const adjustment = { id: 'adjustment', createdAt: new Date(), ...data }; state.adjustments.push(adjustment); return adjustment;
    } },
  };
  const prisma: any = {
    accountBalanceAdjustment: { findMany: async () => state.adjustments },
    $transaction: async (operation: any) => {
      state.attempts += 1;
      if (state.attempts <= (options.serializationFailures ?? 0)) {
        throw new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: '7.8.0' });
      }
      const count = state.adjustments.length;
      try { return await operation(tx); } catch (error) { state.adjustments.splice(count); throw error; }
    },
  };
  const balances: any = {
    getAccountBalance: async (userId: string, accountId: string, asOf: Date, client: any) => {
      state.balanceCalls.push({ userId, accountId, asOf, client });
      return { currentBalance: decimal(options.previousBalance ?? '100.00') };
    },
  };
  return { service: new AccountBalanceAdjustmentsService(prisma, balances), state, tx };
}

describe('AccountBalanceAdjustmentsService', () => {
  for (const [name, newBalance, difference] of [
    ['positive', '150.00', '50.00'],
    ['negative', '80.00', '-20.00'],
    ['zero', '100.00', '0.00'],
  ]) {
    it(`creates a ${name} difference snapshot inside the transaction`, async () => {
      const context = harness();
      const result = await context.service.create('user', 'account', { newBalance, reason: 'Conference' });
      assert.equal(result.adjustment.previousBalance.toFixed(2), '100.00');
      assert.equal(result.adjustment.newBalance.toFixed(2), newBalance);
      assert.equal(result.adjustment.difference.toFixed(2), difference);
      assert.equal(result.currentBalance, newBalance);
      assert.equal(context.state.balanceCalls[0].client, context.tx);
    });
  }

  it('rejects archived accounts without creating records', async () => {
    const context = harness({ accountValid: false });
    await assert.rejects(() => context.service.create('user', 'account', { newBalance: '10.00' }), BadRequestException);
    assert.equal(context.state.adjustments.length, 0);
  });

  it('rolls back creation failures and retries P2034', async () => {
    const failed = harness({ failCreate: true });
    await assert.rejects(() => failed.service.create('user', 'account', { newBalance: '10.00' }), /create failed/);
    assert.equal(failed.state.adjustments.length, 0);
    const retried = harness({ serializationFailures: 2 });
    await retried.service.create('user', 'account', { newBalance: '10.00' });
    assert.equal(retried.state.attempts, 3);
    assert.equal(retried.state.adjustments.length, 1);
  });
});
