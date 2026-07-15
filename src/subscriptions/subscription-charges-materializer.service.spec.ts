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
    assert.equal((result as any).data.isActive, false);
  });
});
