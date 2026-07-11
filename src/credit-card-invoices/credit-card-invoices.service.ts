import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculateCreditCardInvoiceTotal } from './credit-card-invoice-total';
import { ListCreditCardInvoicesDto } from './dto/list-credit-card-invoices.dto';
import { PayCreditCardInvoiceDto } from './dto/pay-credit-card-invoice.dto';

@Injectable()
export class CreditCardInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(userId: string, query: ListCreditCardInvoicesDto) {
    const invoices = await this.prisma.creditCardInvoice.findMany({
      where: {
        userId,
        creditCardId: query.creditCardId,
        year: query.year,
        month: query.month,
        status: query.status,
      },
      include: {
        installments: {
          orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
        },
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    return invoices.map((invoice) => this.withTotal(invoice));
  }

  async findOne(userId: string, id: string) {
    const invoice = await this.prisma.creditCardInvoice.findFirst({
      where: { id, userId },
      include: {
        installments: {
          orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
        },
      },
    });
    if (!invoice) throw new NotFoundException('Credit card invoice not found');
    return this.withTotal(invoice);
  }

  async pay(userId: string, id: string, dto: PayCreditCardInvoiceDto) {
    return this.runSerializableTransaction(async (tx) => {
      const invoice = await tx.creditCardInvoice.findFirst({
        where: { id, userId },
        include: {
          creditCard: { select: { name: true } },
          installments: true,
        },
      });
      if (!invoice) throw new NotFoundException('Credit card invoice not found');
      if (invoice.status === 'paid' || invoice.paidTransactionId) {
        throw new ConflictException('Credit card invoice already paid');
      }
      if (invoice.status === 'canceled') {
        throw new BadRequestException('Canceled credit card invoice cannot be paid');
      }

      const account = await tx.account.findFirst({
        where: { id: dto.accountId, userId },
        select: { id: true },
      });
      if (!account) throw new NotFoundException('Account not found');

      const totalAmount = calculateCreditCardInvoiceTotal(
        invoice.installments,
      );
      if (totalAmount.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          'Credit card invoice total must be greater than zero',
        );
      }

      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
      const month = String(invoice.month).padStart(2, '0');
      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: 'expense',
          amount: totalAmount,
          description: `Pagamento da fatura ${invoice.creditCard.name} - ${month}/${invoice.year}`,
          accountId: account.id,
          paymentMethod: 'transfer',
          source: 'app',
          occurredAt: paidAt,
        },
      });

      await tx.creditCardInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'paid',
          accountId: account.id,
          paidAt,
          paidAmount: totalAmount,
          paidTransactionId: transaction.id,
        },
      });
      await tx.installment.updateMany({
        where: { invoiceId: invoice.id, userId, status: 'pending' },
        data: { status: 'paid' },
      });

      const updatedInvoice = await tx.creditCardInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: {
          installments: {
            orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
          },
        },
      });
      return { ...updatedInvoice, totalAmount, transaction };
    });
  }

  private async runSerializableTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          if (attempt < maxAttempts) continue;
          throw new ConflictException('Credit card invoice payment conflict');
        }
        throw error;
      }
    }
    throw new ConflictException('Credit card invoice payment conflict');
  }

  private withTotal<
    T extends {
      installments: { installmentAmount: Prisma.Decimal; status: string }[];
    },
  >(invoice: T) {
    const totalAmount = calculateCreditCardInvoiceTotal(
      invoice.installments,
    );
    return { ...invoice, totalAmount };
  }
}
