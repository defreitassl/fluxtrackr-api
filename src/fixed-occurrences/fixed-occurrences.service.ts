import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListFixedOccurrencesDto } from './dto/list-fixed-occurrences.dto';
import { RealizeFixedOccurrenceDto } from './dto/realize-fixed-occurrence.dto';

@Injectable()
export class FixedOccurrencesService {
  constructor(private readonly prisma: PrismaService) {}

  findMany(userId: string, filters: ListFixedOccurrencesDto) {
    return this.prisma.fixedOccurrence.findMany({
      where: {
        userId,
        type: filters.type,
        status: filters.status,
        fixedExpenseId: filters.fixedExpenseId,
        fixedIncomeId: filters.fixedIncomeId,
        occurrenceDate: filters.startDate || filters.endDate ? {
          gte: filters.startDate ? new Date(filters.startDate) : undefined,
          lte: filters.endDate ? new Date(filters.endDate) : undefined,
        } : undefined,
      },
      orderBy: [{ occurrenceDate: 'asc' }, { id: 'asc' }],
    });
  }

  async findOne(userId: string, id: string) {
    const occurrence = await this.prisma.fixedOccurrence.findFirst({ where: { id, userId } });
    if (!occurrence) throw new NotFoundException('Fixed occurrence not found');
    return occurrence;
  }

  realize(userId: string, id: string, dto: RealizeFixedOccurrenceDto) {
    return this.runSerializableTransaction(async (tx) => {
      const occurrence = await tx.fixedOccurrence.findFirst({
        where: { id, userId },
        include: { fixedExpense: true, fixedIncome: true },
      });
      if (!occurrence) throw new NotFoundException('Fixed occurrence not found');
      if (occurrence.status === 'realized' || occurrence.realizedTransactionId) {
        throw new ConflictException('Fixed occurrence already realized');
      }
      if (occurrence.status !== 'pending') {
        throw new ConflictException('Only pending fixed occurrences can be realized');
      }
      const template = occurrence.fixedExpense ?? occurrence.fixedIncome;
      const accountId = dto.accountId ?? occurrence.accountId ?? template?.accountId;
      const categoryId = dto.categoryId ?? occurrence.categoryId ?? template?.categoryId;
      const paymentMethod = dto.paymentMethod ?? occurrence.paymentMethod ?? template?.paymentMethod;
      if (!accountId) throw new BadRequestException('accountId is required');
      if (!paymentMethod) throw new BadRequestException('paymentMethod is required');
      if (paymentMethod === 'credit') throw new BadRequestException('Fixed occurrence does not accept credit paymentMethod');
      const account = await tx.account.findFirst({
        where: { id: accountId, userId, isActive: true }, select: { id: true },
      });
      if (!account) throw new BadRequestException('Invalid accountId');
      if (categoryId) {
        const category = await tx.category.findFirst({
          where: { id: categoryId, userId, type: { in: occurrence.type === 'income' ? ['income', 'both'] : ['expense', 'both'] } },
          select: { id: true },
        });
        if (!category) throw new BadRequestException('Invalid categoryId');
      }
      const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
      const transaction = await tx.transaction.create({ data: {
        userId, type: occurrence.type, amount: occurrence.amount,
        description: occurrence.name, accountId, categoryId,
        paymentMethod, occurredAt, source: 'app',
      } });
      const realizedAt = new Date();
      const updated = await tx.fixedOccurrence.update({
        where: { id },
        data: { status: 'realized', accountId, categoryId, paymentMethod, realizedTransactionId: transaction.id, realizedAt },
      });
      return { occurrence: updated, transaction };
    });
  }

  cancel(userId: string, id: string) {
    return this.runSerializableTransaction(async (tx) => {
      const occurrence = await tx.fixedOccurrence.findFirst({ where: { id, userId } });
      if (!occurrence) throw new NotFoundException('Fixed occurrence not found');
      if (occurrence.status !== 'pending') throw new ConflictException('Only pending fixed occurrences can be canceled');
      return tx.fixedOccurrence.update({ where: { id }, data: { status: 'canceled' } });
    });
  }

  private async runSerializableTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < maxAttempts) continue;
          throw new ConflictException('Fixed occurrence state transition conflict');
        }
        throw error;
      }
    }
    throw new ConflictException('Fixed occurrence could not be processed');
  }
}
