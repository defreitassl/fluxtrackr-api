import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SubscriptionChargesService } from './subscription-charges.service';

class FixedClockSubscriptionChargesService extends SubscriptionChargesService {
  protected now() { return new Date('2026-07-15T12:00:00.000Z'); }
}

const service = () => new FixedClockSubscriptionChargesService({} as any, {} as any, {} as any);

describe('SubscriptionChargesService realization validation', () => {
  it('rejects mutually exclusive destinations and credit-card payment method', async () => {
    assert.throws(() => service().realize('owner', 'charge', { accountId: 'account', creditCardId: 'card' }), BadRequestException);
    assert.throws(() => service().realize('owner', 'charge', { creditCardId: 'card', paymentMethod: 'pix' as any }), BadRequestException);
  });

  it('accepts past/current occurredAt and rejects future occurredAt before writes', async () => {
    const target = service();
    assert.throws(() => target.realize('owner', 'charge', { occurredAt: '2026-07-15T12:00:00.001Z' }), BadRequestException);
    assert.throws(() => target.realize('owner', 'charge', { occurredAt: 'invalid-date' }), BadRequestException);
  });

  it('uses same controlled instant for cancellation state and refresh', async () => {
    let canceledAt: Date | undefined;
    let refreshAt: Date | undefined;
    const charge: any = { id: 'charge', status: 'pending', subscription: { id: 'subscription', autoRenew: false, isActive: true } };
    const prisma = {
      $transaction: async (operation: any) => operation({ subscriptionCharge: { findFirst: async () => charge, update: async (args: any) => (canceledAt = args.data.canceledAt, args.data) } }),
    };
    const materializer = { refreshNextCharge: async (_id: string, reference: Date) => { refreshAt = reference; } };
    const target = new FixedClockSubscriptionChargesService(prisma as any, {} as any, materializer as any);
    await target.cancel('owner', 'charge');
    assert.equal(canceledAt?.toISOString(), '2026-07-15T12:00:00.000Z');
    assert.equal(refreshAt?.toISOString(), '2026-07-15T12:00:00.000Z');
  });
});
