import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CreditCardsService } from './credit-cards.service';

describe('CreditCardsService archive', () => {
  it('archives the card without deleting purchases, installments, or invoices', async () => {
    const calls = { update: 0, delete: 0 };
    const prisma = {
      creditCard: {
        findFirst: async () => ({ id: 'card', isActive: true }),
        update: async ({ data }: any) => {
          calls.update += 1;
          assert.deepEqual(data, { isActive: false });
          return { id: 'card', ...data };
        },
        delete: async () => {
          calls.delete += 1;
        },
      },
      creditCardPurchase: { count: async () => 2 },
      installment: { count: async () => 12 },
      creditCardInvoice: { count: async () => 12 },
    };

    const service = new CreditCardsService(prisma as any);
    assert.deepEqual(await service.remove('user', 'card'), { archived: true });
    assert.equal(calls.update, 1);
    assert.equal(calls.delete, 0);
    assert.equal(await prisma.creditCardPurchase.count(), 2);
    assert.equal(await prisma.installment.count(), 12);
    assert.equal(await prisma.creditCardInvoice.count(), 12);
  });

  it('lists active cards by default and accepts an inactive filter', async () => {
    const filters: boolean[] = [];
    const prisma = {
      creditCard: {
        findMany: async ({ where }: any) => {
          filters.push(where.isActive);
          return [];
        },
      },
    };
    const service = new CreditCardsService(prisma as any);
    await service.findMany('user', {});
    await service.findMany('user', { isActive: false });
    assert.deepEqual(filters, [true, false]);
  });

  it('allows reactivation through update', async () => {
    let updatedData: unknown;
    const prisma = {
      creditCard: {
        findFirst: async () => ({ id: 'card', isActive: false }),
        update: async ({ data }: any) => {
          updatedData = data;
          return { id: 'card', ...data };
        },
      },
      account: { findFirst: async () => null },
    };
    const service = new CreditCardsService(prisma as any);
    await service.update('user', 'card', { isActive: true });
    assert.deepEqual(updatedData, { isActive: true });
  });
});
