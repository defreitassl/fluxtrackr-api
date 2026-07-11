import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { AccountBalanceService } from './account-balance.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);

function harness(values: Record<string, string | null> = {}) {
  const calls: any = { transactions: [], transfers: [], adjustments: [] };
  const transactionValues = [values.income ?? null, values.expense ?? null];
  const transferValues = [values.incoming ?? null, values.outgoing ?? null];
  const prisma: any = {
    account: {
      findFirst: async (args: any) => (calls.account = args, { id: 'account', initialBalance: decimal(values.initial ?? '100.00') }),
      aggregate: async (args: any) => (calls.consolidatedAccounts = args, { _sum: { initialBalance: decimal(values.initial ?? '100.00') } }),
    },
    transaction: {
      aggregate: async (args: any) => {
        calls.transactions.push(args);
        const value = transactionValues.shift();
        return { _sum: { amount: value == null ? null : decimal(value) } };
      },
    },
    accountTransfer: {
      aggregate: async (args: any) => {
        calls.transfers.push(args);
        const value = transferValues.shift();
        return { _sum: { amount: value == null ? null : decimal(value) } };
      },
    },
    accountBalanceAdjustment: {
      aggregate: async (args: any) => {
        calls.adjustments.push(args);
        return { _sum: { difference: values.adjustments == null ? null : decimal(values.adjustments) } };
      },
    },
  };
  return { service: new AccountBalanceService(prisma), calls };
}

describe('AccountBalanceService', () => {
  it('calculates account balance from every movement with decimal precision', async () => {
    const context = harness({ initial: '100.10', income: '50.05', expense: '20.02', incoming: '10.01', outgoing: '5.00', adjustments: '-2.03' });
    const asOf = new Date('2026-07-15T14:00:00.000Z');
    const result = await context.service.getAccountBalance('user', 'account', asOf);
    assert.equal(result.currentBalance.toFixed(2), '133.11');
    assert.equal(result.adjustments.toFixed(2), '-2.03');
    for (const call of [...context.calls.transactions, ...context.calls.transfers, ...context.calls.adjustments]) {
      assert.equal(call.where.userId, 'user');
      assert.equal(call.where.occurredAt.lte.toISOString(), asOf.toISOString());
    }
  });

  it('uses initial balance when no movements exist', async () => {
    const result = await harness({ initial: '42.42' }).service.getAccountBalance('user', 'account', new Date());
    assert.equal(result.currentBalance.toFixed(2), '42.42');
  });

  it('calculates consolidated active-account balance and cancels internal transfers', async () => {
    const context = harness({ initial: '100', income: '20', expense: '5', incoming: '30', outgoing: '30', adjustments: '10' });
    const result = await context.service.getConsolidatedBalance('user', new Date('2026-07-15T00:00:00.000Z'));
    assert.equal(result.toFixed(2), '125.00');
    assert.deepEqual(context.calls.consolidatedAccounts.where, { userId: 'user', isActive: true });
    assert.deepEqual(context.calls.transactions[0].where.account.is, { userId: 'user', isActive: true });
    assert.deepEqual(context.calls.adjustments[0].where.account.is, { userId: 'user', isActive: true });
  });
});
