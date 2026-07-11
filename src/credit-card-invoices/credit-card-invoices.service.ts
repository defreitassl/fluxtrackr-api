import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListCreditCardInvoicesDto } from './dto/list-credit-card-invoices.dto';

@Injectable()
export class CreditCardInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(userId: string, query: ListCreditCardInvoicesDto) {
    const invoices = await this.prisma.creditCardInvoice.findMany({
      where: { userId, creditCardId: query.creditCardId, year: query.year, month: query.month, status: query.status },
      include: { installments: { orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }] } },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    return invoices.map((invoice) => this.withTotal(invoice));
  }

  async findOne(userId: string, id: string) {
    const invoice = await this.prisma.creditCardInvoice.findFirst({
      where: { id, userId },
      include: { installments: { orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }] } },
    });
    if (!invoice) throw new NotFoundException('Credit card invoice not found');
    return this.withTotal(invoice);
  }

  private withTotal<T extends { installments: { installmentAmount: Prisma.Decimal }[] }>(invoice: T) {
    const totalAmount = invoice.installments.reduce((sum, item) => sum.add(item.installmentAmount), new Prisma.Decimal(0));
    return { ...invoice, totalAmount };
  }
}
