import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getInvoiceCycles, splitAmountInCents } from './credit-card-cycle';
import { CreateCreditCardPurchaseDto } from './dto/create-credit-card-purchase.dto';
import { ListCreditCardPurchasesDto } from './dto/list-credit-card-purchases.dto';

@Injectable()
export class CreditCardPurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateCreditCardPurchaseDto) {
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.creditCard.findFirst({
        where: { id: dto.creditCardId, userId },
        select: { id: true, accountId: true, closingDay: true, dueDay: true },
      });
      if (!card) throw new NotFoundException('Credit card not found');
      if (card.closingDay === null) {
        throw new BadRequestException('Credit card must have a closingDay');
      }

      if (dto.categoryId) {
        const category = await tx.category.findFirst({
          where: { id: dto.categoryId, userId, type: { in: ['expense', 'both'] } },
          select: { id: true },
        });
        if (!category) throw new BadRequestException('Invalid categoryId');
      }

      const purchaseDate = new Date(dto.purchaseDate);
      const purchase = await tx.creditCardPurchase.create({
        data: {
          userId,
          creditCardId: card.id,
          categoryId: dto.categoryId,
          description: dto.description,
          totalAmount: dto.totalAmount,
          purchaseDate,
          installmentCount: dto.installmentCount,
        },
      });
      const amounts = splitAmountInCents(dto.totalAmount, dto.installmentCount);
      const cycles = getInvoiceCycles(purchaseDate, card.closingDay, card.dueDay, dto.installmentCount);

      for (let index = 0; index < dto.installmentCount; index += 1) {
        const cycle = cycles[index];
        const year = cycle.dueDate.getUTCFullYear();
        const month = cycle.dueDate.getUTCMonth() + 1;
        const invoice = await tx.creditCardInvoice.upsert({
          where: { creditCardId_year_month: { creditCardId: card.id, year, month } },
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
            categoryId: dto.categoryId,
            description: dto.description,
            totalPurchaseAmount: dto.totalAmount,
            installmentAmount: new Prisma.Decimal(amounts[index]).div(100),
            installmentNumber: index + 1,
            installmentCount: dto.installmentCount,
            purchaseDate,
            dueDate: cycle.dueDate,
          },
        });
      }

      return tx.creditCardPurchase.findUniqueOrThrow({
        where: { id: purchase.id },
        include: { installments: { include: { invoice: true }, orderBy: { installmentNumber: 'asc' } } },
      });
    });
  }

  findMany(userId: string, query: ListCreditCardPurchasesDto) {
    return this.prisma.creditCardPurchase.findMany({
      where: {
        userId,
        creditCardId: query.creditCardId,
        purchaseDate: query.startDate || query.endDate ? {
          gte: query.startDate ? new Date(query.startDate) : undefined,
          lte: query.endDate ? new Date(query.endDate) : undefined,
        } : undefined,
      },
      include: { installments: { orderBy: { installmentNumber: 'asc' } } },
      orderBy: { purchaseDate: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const purchase = await this.prisma.creditCardPurchase.findFirst({
      where: { id, userId },
      include: { installments: { include: { invoice: true }, orderBy: { installmentNumber: 'asc' } } },
    });
    if (!purchase) throw new NotFoundException('Credit card purchase not found');
    return purchase;
  }
}
