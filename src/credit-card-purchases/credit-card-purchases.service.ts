import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreditCardPurchaseDomainService } from './credit-card-purchase-domain.service';
import { CreateCreditCardPurchaseDto } from './dto/create-credit-card-purchase.dto';
import { ListCreditCardPurchasesDto } from './dto/list-credit-card-purchases.dto';

@Injectable()
export class CreditCardPurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchaseDomain: CreditCardPurchaseDomainService,
  ) {}

  create(userId: string, dto: CreateCreditCardPurchaseDto) {
    return this.prisma.$transaction((tx) =>
      this.purchaseDomain.create(tx, userId, {
        ...dto,
        purchaseDate: new Date(dto.purchaseDate),
      }),
    );
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
