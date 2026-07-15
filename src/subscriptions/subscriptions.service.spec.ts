import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { SubscriptionsService } from './subscriptions.service';

const current = (overrides: Record<string, unknown> = {}): any => ({
  id: 'subscription', userId: 'owner', name: 'Service', amount: new Prisma.Decimal('10'),
  recurrenceAnchorDate: new Date('2026-01-31T12:00:00.000Z'), nextChargeDate: new Date('2026-02-28T12:00:00.000Z'),
  recurrence: 'monthly', categoryId: null, accountId: 'account', creditCardId: null, paymentMethod: 'pix',
  autoRenew: true, isActive: true, createdAt: new Date(), updatedAt: new Date(), ...overrides,
});

describe('SubscriptionsService recurrence anchor', () => {
  const service = new SubscriptionsService({} as any, {} as any);

  it('sets anchor and next charge to create DTO date', () => {
    const data = (service as any).fromDto({ name: 'Service', amount: 10, nextChargeDate: '2026-01-31T12:00:00.000Z', recurrence: 'monthly', accountId: 'account', paymentMethod: 'pix' });
    assert.equal(data.recurrenceAnchorDate.toISOString(), '2026-01-31T12:00:00.000Z');
    assert.equal(data.nextChargeDate.toISOString(), '2026-01-31T12:00:00.000Z');
  });

  it('moves anchor only when PATCH supplies nextChargeDate', () => {
    const moved = (service as any).merge(current(), { nextChargeDate: '2026-03-31T12:00:00.000Z' });
    const unchanged = (service as any).merge(current(), { name: 'Renamed' });
    assert.equal(moved.recurrenceAnchorDate.toISOString(), '2026-03-31T12:00:00.000Z');
    assert.equal(moved.nextChargeDate.toISOString(), '2026-03-31T12:00:00.000Z');
    assert.equal(unchanged.recurrenceAnchorDate.toISOString(), '2026-01-31T12:00:00.000Z');
  });

  it('migration backfills existing nextChargeDate before enforcing NOT NULL', () => {
    const sql = readFileSync('prisma/migrations/20260715170000_add_subscription_recurrence_anchor_date/migration.sql', 'utf8');
    assert.match(sql, /ADD COLUMN "recurrenceAnchorDate" TIMESTAMP\(3\);/);
    assert.match(sql, /SET "recurrenceAnchorDate" = "nextChargeDate"/);
    assert.match(sql, /ALTER COLUMN "recurrenceAnchorDate" SET NOT NULL/);
  });

  it('does not materialize subscriptions created inactive', async () => {
    let materialized = false;
    const tx: any = {
      account: { findFirst: async () => ({ id: 'account' }) },
      subscription: {
        create: async ({ data }: any) => ({ id: 'subscription', userId: 'owner', ...data }),
        findUniqueOrThrow: async () => ({ id: 'subscription' }),
      },
    };
    const prisma = { $transaction: async (operation: any) => operation(tx) };
    const materializer = { materializeSubscription: async () => { materialized = true; } };
    const target = new SubscriptionsService(prisma as any, materializer as any);
    await target.create('owner', { name: 'Inactive', amount: 10, nextChargeDate: '2026-01-31T00:00:00.000Z', recurrence: 'monthly', accountId: 'account', paymentMethod: 'pix', isActive: false });
    assert.equal(materialized, false);
  });
});
