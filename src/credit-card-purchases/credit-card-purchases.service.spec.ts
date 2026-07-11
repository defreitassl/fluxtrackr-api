import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreditCardPurchasesService } from './credit-card-purchases.service';
import { CreditCardPurchaseDomainService } from './credit-card-purchase-domain.service';

const dto = {
  creditCardId: '00000000-0000-4000-8000-000000000001',
  description: 'Purchase',
  totalAmount: 10,
  purchaseDate: '2026-07-10T12:00:00.000Z',
  installmentCount: 1,
};

const createService = (prisma: any) =>
  new CreditCardPurchasesService(
    prisma,
    new CreditCardPurchaseDomainService(),
  );

function transactionPrisma(card: object | null, category: object | null = { id: 'category' }) {
  const invoices = new Map<string, { id: string }>();
  let purchaseNumber = 0;
  const tx = {
    creditCard: {
      findFirst: async ({ where }: any) =>
        card && where.isActive === true && (card as any).isActive !== false
          ? card
          : null,
    },
    category: { findFirst: async () => category },
    creditCardPurchase: {
      create: async ({ data }: any) => ({ id: `purchase-${++purchaseNumber}`, ...data }),
      findUniqueOrThrow: async ({ where }: any) => ({ id: where.id, installments: [] }),
    },
    creditCardInvoice: {
      upsert: async ({ create }: any) => {
        const key = `${create.creditCardId}-${create.year}-${create.month}`;
        if (!invoices.has(key)) invoices.set(key, { id: `invoice-${invoices.size + 1}` });
        return invoices.get(key);
      },
    },
    installment: { create: async ({ data }: any) => data },
  };
  const prisma = { $transaction: (callback: any) => callback(tx) };
  return { prisma, invoices };
}

describe('CreditCardPurchasesService', () => {
  it('rejects a card from another user as not found', async () => {
    const { prisma } = transactionPrisma(null);
    await assert.rejects(() => createService(prisma).create('user-a', dto), NotFoundException);
  });

  it('rejects a card without closingDay', async () => {
    const { prisma } = transactionPrisma({ id: dto.creditCardId, accountId: null, closingDay: null, dueDay: 7 });
    await assert.rejects(() => createService(prisma).create('user-a', dto), BadRequestException);
  });

  it('rejects an archived card as not found', async () => {
    const { prisma } = transactionPrisma({
      id: dto.creditCardId,
      accountId: null,
      closingDay: 25,
      dueDay: 7,
      isActive: false,
    });
    await assert.rejects(
      () => createService(prisma).create('user-a', dto),
      NotFoundException,
    );
  });

  it('rejects a category that is absent, foreign, or not an expense', async () => {
    const { prisma } = transactionPrisma({ id: dto.creditCardId, accountId: null, closingDay: 25, dueDay: 7 }, null);
    await assert.rejects(() => createService(prisma).create('user-a', { ...dto, categoryId: '00000000-0000-4000-8000-000000000002' }), BadRequestException);
  });

  it('reuses the same monthly invoice for multiple purchases', async () => {
    const { prisma, invoices } = transactionPrisma({ id: dto.creditCardId, accountId: 'account', closingDay: 25, dueDay: 7 });
    const service = createService(prisma);
    await service.create('user-a', dto);
    await service.create('user-a', dto);
    assert.equal(invoices.size, 1);
  });

  it('isolates purchase reads by user and returns 404', async () => {
    const prisma = { creditCardPurchase: { findFirst: async ({ where }: any) => where.userId === 'owner' ? { id: where.id, installments: [] } : null } };
    const service = createService(prisma);
    await assert.rejects(() => service.findOne('other-user', 'purchase'), NotFoundException);
  });
});
