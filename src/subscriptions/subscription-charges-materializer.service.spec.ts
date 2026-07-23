import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { getRecurringDate, SubscriptionChargesMaterializerService } from './subscription-charges-materializer.service';

const template = (overrides: Record<string, unknown> = {}): any => ({
  id: 'subscription', userId: 'user', name: 'Service', amount: new Prisma.Decimal('10.00'),
  recurrenceAnchorDate: new Date('2026-01-31T10:11:12.123Z'), nextChargeDate: new Date('2026-01-31T10:11:12.123Z'), recurrence: 'monthly', categoryId: null,
  accountId: 'account', creditCardId: null, paymentMethod: 'pix', autoRenew: true, isActive: true,
  createdAt: new Date(), updatedAt: new Date(), ...overrides,
});

function materializerHarness(subscription = template(), initial: any[] = []) {
  const rows = initial.map((row) => ({ ...row, chargeDate: new Date(row.chargeDate) }));
  const calls = { createMany: 0, update: 0, updateMany: 0, subscriptionUpdate: 0 };
  const subscriptionCharge = {
    findMany: async ({ where }: any) => rows.filter((row) => {
      if (row.subscriptionId !== where.subscriptionId) return false;
      if (where.OR) return where.OR.some((entry: any) => row.chargeDate.getTime() === entry.chargeDate.getTime());
      return row.status === where.status && row.chargeDate >= where.chargeDate.gte;
    }),
    createMany: async ({ data }: any) => {
      calls.createMany += 1;
      let count = 0;
      for (const item of data) {
        if (rows.some((row) => row.subscriptionId === item.subscriptionId && row.chargeDate.getTime() === item.chargeDate.getTime())) continue;
        rows.push({ id: `charge-${rows.length + 1}`, status: 'pending', ...item });
        count += 1;
      }
      return { count };
    },
    update: async ({ where, data }: any) => {
      calls.update += 1;
      const row = rows.find((item) => item.id === where.id);
      if (!row) throw new Error('missing charge');
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      calls.updateMany += 1;
      const targets = rows.filter((row) => where.id.in.includes(row.id));
      targets.forEach((row) => Object.assign(row, data));
      return { count: targets.length };
    },
    findFirst: async ({ where }: any) => rows
      .filter((row) => row.subscriptionId === where.subscriptionId && row.status === where.status)
      .sort((left, right) => left.chargeDate.getTime() - right.chargeDate.getTime())[0] ?? null,
  };
  const prisma: any = {
    subscriptionCharge,
    subscription: {
      findMany: async () => [subscription],
      findUniqueOrThrow: async () => subscription,
      update: async ({ data }: any) => {
        calls.subscriptionUpdate += 1;
        Object.assign(subscription, data);
        return subscription;
      },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  return { service: new SubscriptionChargesMaterializerService(prisma), rows, calls };
}

describe('SubscriptionChargesMaterializerService schedule', () => {
  const service = new SubscriptionChargesMaterializerService({} as any);
  it('uses immutable UTC anchor and restores day 31 after February', () => {
    const dates = service.desiredChargeDates(template(), new Date('2026-01-01T12:00:00.000Z'));
    assert.equal(dates[0].toISOString(), '2026-01-31T10:11:12.123Z');
    assert.equal(dates[1].toISOString(), '2026-02-28T10:11:12.123Z');
    assert.equal(dates[2].toISOString(), '2026-03-31T10:11:12.123Z');
    assert.equal(dates.length, 14);
  });
  it('never uses derived nextChargeDate as recurrence base', () => {
    const dates = service.desiredChargeDates(template({ nextChargeDate: new Date('2026-02-28T10:11:12.123Z') }), new Date('2026-01-01T12:00:00.000Z'));
    assert.deepEqual(dates.slice(0, 3).map((date) => date.toISOString()), ['2026-01-31T10:11:12.123Z', '2026-02-28T10:11:12.123Z', '2026-03-31T10:11:12.123Z']);
  });
  it('handles non-leap and leap February, day 30, and UTC time', () => {
    const nonLeap = new Date('2026-01-31T23:59:58.987Z');
    const leap = new Date('2024-01-31T23:59:58.987Z');
    assert.equal(getRecurringDate(nonLeap, 1).toISOString(), '2026-02-28T23:59:58.987Z');
    assert.equal(getRecurringDate(nonLeap, 2).toISOString(), '2026-03-31T23:59:58.987Z');
    assert.equal(getRecurringDate(leap, 1).toISOString(), '2024-02-29T23:59:58.987Z');
    assert.equal(getRecurringDate(new Date('2026-01-30T01:02:03.004Z'), 1).toISOString(), '2026-02-28T01:02:03.004Z');
    assert.equal(getRecurringDate(new Date('2026-01-30T01:02:03.004Z'), 2).toISOString(), '2026-03-30T01:02:03.004Z');
  });
  it('generates semiannual and yearly dates within the 14-month UTC horizon', () => {
    assert.deepEqual(service.desiredChargeDates(template({ recurrence: 'semiannual' }), new Date('2026-01-01T00:00:00.000Z')).map((date) => date.toISOString()), ['2026-01-31T10:11:12.123Z', '2026-07-31T10:11:12.123Z', '2027-01-31T10:11:12.123Z']);
    assert.deepEqual(service.desiredChargeDates(template({ recurrence: 'yearly' }), new Date('2026-01-01T00:00:00.000Z')).map((date) => date.toISOString()), ['2026-01-31T10:11:12.123Z', '2027-01-31T10:11:12.123Z']);
  });
  it('materializes one configured charge when autoRenew is false', () => {
    assert.deepEqual(service.desiredChargeDates(template({ autoRenew: false }), new Date('2030-01-01T00:00:00.000Z')).map((date) => date.toISOString()), ['2026-01-31T10:11:12.123Z']);
  });
  it('does not touch inactive subscriptions or reactivate during refresh', async () => {
    const inactive = template({ isActive: false });
    const prisma = { subscription: { findUniqueOrThrow: async () => inactive, update: async (args: any) => args }, subscriptionCharge: { findFirst: async () => null } };
    const inactiveResult = await new SubscriptionChargesMaterializerService(prisma as any).materializeSubscription(inactive);
    assert.equal(inactiveResult, inactive);
    const result = await new SubscriptionChargesMaterializerService(prisma as any).refreshNextCharge('subscription', new Date('2026-02-01T00:00:00.000Z'));
    assert.equal(result.isActive, false);
  });

  it('does not write again when charge snapshots are unchanged', async () => {
    const context = materializerHarness();
    const reference = new Date('2026-01-01T00:00:00.000Z');
    await context.service.materializeAll(reference);
    context.calls.createMany = 0;
    context.calls.update = 0;
    context.calls.updateMany = 0;
    context.calls.subscriptionUpdate = 0;

    const metrics = await context.service.materializeAll(reference);

    assert.equal(metrics.recordsCreated, 0);
    assert.equal(metrics.recordsUpdated, 0);
    assert.equal(metrics.recordsCanceled, 0);
    assert.equal(metrics.recordsSkipped, 14);
    assert.equal(context.calls.createMany, 0);
    assert.equal(context.calls.update, 0);
    assert.equal(context.calls.updateMany, 0);
    assert.equal(context.calls.subscriptionUpdate, 0);
  });

  it('updates only changed pending charges and preserves realized and canceled charges', async () => {
    const context = materializerHarness();
    const reference = new Date('2026-01-01T00:00:00.000Z');
    await context.service.materializeAll(reference);
    const pending = context.rows[0];
    const realized = context.rows[1];
    const canceled = context.rows[2];
    pending.name = 'Outdated';
    realized.status = 'realized';
    realized.name = 'Realized snapshot';
    canceled.status = 'canceled';
    canceled.name = 'Canceled snapshot';
    context.calls.update = 0;

    const metrics = await context.service.materializeAll(reference);

    assert.equal(metrics.recordsUpdated, 1);
    assert.equal(context.calls.update, 1);
    assert.equal(pending.name, 'Service');
    assert.equal(realized.name, 'Realized snapshot');
    assert.equal(canceled.name, 'Canceled snapshot');
  });

  it('cancels stale pending charges with one batch write', async () => {
    const staleDate = new Date('2027-03-31T10:11:12.123Z');
    const context = materializerHarness(template(), [{
      id: 'stale', status: 'pending', subscriptionId: 'subscription', userId: 'user',
      chargeDate: staleDate, name: 'Service', amount: new Prisma.Decimal('10.00'),
      year: 2027, month: 3, categoryId: null, accountId: 'account', creditCardId: null,
      paymentMethod: 'pix',
    }]);

    const metrics = await context.service.materializeAll(new Date('2026-01-01T00:00:00.000Z'));

    assert.equal(metrics.recordsCanceled, 1);
    assert.equal(context.calls.updateMany, 1);
    assert.equal(context.rows.find((row) => row.id === 'stale')?.status, 'canceled');
  });
});
