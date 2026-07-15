import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { SubscriptionChargesMaterializerService } from './subscription-charges-materializer.service';

const template = (overrides: Record<string, unknown> = {}): any => ({
  id: 'subscription', userId: 'user', name: 'Service', amount: new Prisma.Decimal('10.00'),
  nextChargeDate: new Date('2026-01-31T00:00:00.000Z'), recurrence: 'monthly', categoryId: null,
  accountId: 'account', creditCardId: null, paymentMethod: 'pix', autoRenew: true, isActive: true,
  createdAt: new Date(), updatedAt: new Date(), ...overrides,
});

describe('SubscriptionChargesMaterializerService schedule', () => {
  const service = new SubscriptionChargesMaterializerService({} as any);
  it('uses UTC and clamps a monthly base day to February', () => {
    const dates = service.desiredChargeDates(template(), new Date('2026-01-01T12:00:00.000Z'));
    assert.equal(dates[0].toISOString(), '2026-01-31T00:00:00.000Z');
    assert.equal(dates[1].toISOString(), '2026-02-28T00:00:00.000Z');
    assert.equal(dates.length, 14);
  });
  it('generates semiannual and yearly dates within the 14-month UTC horizon', () => {
    assert.deepEqual(service.desiredChargeDates(template({ recurrence: 'semiannual' }), new Date('2026-01-01T00:00:00.000Z')).map((date) => date.toISOString()), ['2026-01-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z', '2027-01-31T00:00:00.000Z']);
    assert.deepEqual(service.desiredChargeDates(template({ recurrence: 'yearly' }), new Date('2026-01-01T00:00:00.000Z')).map((date) => date.toISOString()), ['2026-01-31T00:00:00.000Z', '2027-01-31T00:00:00.000Z']);
  });
  it('materializes one configured charge when autoRenew is false', () => {
    assert.deepEqual(service.desiredChargeDates(template({ autoRenew: false }), new Date('2030-01-01T00:00:00.000Z')).map((date) => date.toISOString()), ['2026-01-31T00:00:00.000Z']);
  });
});
