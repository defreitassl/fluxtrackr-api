import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getInvoiceCycles, splitAmountInCents } from './credit-card-cycle';

export type CreateCreditCardPurchaseInput = {
  creditCardId: string;
  categoryId?: string | null;
  description: string;
  totalAmount: number | Prisma.Decimal;
  purchaseDate: Date;
  installmentCount: number;
};

@Injectable()
export class CreditCardPurchaseDomainService {
  async create(
    tx: Prisma.TransactionClient,
    userId: string,
    input: CreateCreditCardPurchaseInput,
  ) {
    const card = await tx.creditCard.findFirst({
      where: { id: input.creditCardId, userId, isActive: true },
      select: { id: true, accountId: true, closingDay: true, dueDay: true },
    });
    if (!card) throw new NotFoundException('Credit card not found');
    if (card.closingDay === null) {
      throw new BadRequestException('Credit card must have a closingDay');
    }

    if (input.categoryId) {
      const category = await tx.category.findFirst({
        where: {
          id: input.categoryId,
          userId,
          type: { in: ['expense', 'both'] },
        },
        select: { id: true },
      });
      if (!category) throw new BadRequestException('Invalid categoryId');
    }

    const totalAmount = new Prisma.Decimal(input.totalAmount);
    const purchase = await tx.creditCardPurchase.create({
      data: {
        userId,
        creditCardId: card.id,
        categoryId: input.categoryId,
        description: input.description,
        totalAmount,
        purchaseDate: input.purchaseDate,
        installmentCount: input.installmentCount,
      },
    });
    const amounts = splitAmountInCents(
      totalAmount.toNumber(),
      input.installmentCount,
    );
    const cycles = getInvoiceCycles(
      input.purchaseDate,
      card.closingDay,
      card.dueDay,
      input.installmentCount,
    );

    for (let index = 0; index < input.installmentCount; index += 1) {
      const cycle = cycles[index];
      const year = cycle.dueDate.getUTCFullYear();
      const month = cycle.dueDate.getUTCMonth() + 1;
      const invoice = await tx.creditCardInvoice.upsert({
        where: {
          creditCardId_year_month: { creditCardId: card.id, year, month },
        },
        update: {},
        create: {
          userId,
          creditCardId: card.id,
          accountId: card.accountId,
          year,
          month,
          dueDate: cycle.dueDate,
          closingDate: cycle.closingDate,
        },
      });
      await tx.installment.create({
        data: {
          userId,
          creditCardId: card.id,
          invoiceId: invoice.id,
          purchaseId: purchase.id,
          categoryId: input.categoryId,
          description: input.description,
          totalPurchaseAmount: totalAmount,
          installmentAmount: new Prisma.Decimal(amounts[index]).div(100),
          installmentNumber: index + 1,
          installmentCount: input.installmentCount,
          purchaseDate: input.purchaseDate,
          dueDate: cycle.dueDate,
        },
      });
    }

    return tx.creditCardPurchase.findUniqueOrThrow({
      where: { id: purchase.id },
      include: {
        installments: {
          include: { invoice: true },
          orderBy: { installmentNumber: 'asc' },
        },
      },
    });
  }
}
