import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activities/activity.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService, private readonly activities: ActivityService) {}

  async create(userId: string, createTransactionDto: CreateTransactionDto) {
    await this.ensureCategoryBelongsToUser(
      userId,
      createTransactionDto.categoryId,
    );
    await this.ensureAccountBelongsToUser(userId, createTransactionDto.accountId);

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
        userId,
        type: createTransactionDto.type,
        amount: createTransactionDto.amount,
        description: createTransactionDto.description,
        categoryId: createTransactionDto.categoryId,
        accountId: createTransactionDto.accountId,
        paymentMethod: createTransactionDto.paymentMethod,
        occurredAt: createTransactionDto.occurredAt
          ? new Date(createTransactionDto.occurredAt)
          : new Date(),
        source: createTransactionDto.source,
        },
      });
      await this.activities.record(tx, {
        userId, type: 'transaction_created', entityType: 'transaction', entityId: transaction.id,
        title: 'Transação criada', description: transaction.description,
        metadata: { amount: transaction.amount.toFixed(2), transactionType: transaction.type }, occurredAt: transaction.occurredAt,
      });
      return transaction;
    });
  }

  findMany(userId: string, filters: ListTransactionsDto) {
    const where: Prisma.TransactionWhereInput = {
      userId,
      type: filters.type,
      categoryId: filters.categoryId,
      accountId: filters.accountId,
      paymentMethod: filters.paymentMethod,
      occurredAt:
        filters.startDate || filters.endDate
          ? {
              gte: filters.startDate ? new Date(filters.startDate) : undefined,
              lte: filters.endDate ? new Date(filters.endDate) : undefined,
            }
          : undefined,
    };

    return this.prisma.transaction.findMany({
      where,
      orderBy: {
        occurredAt: 'desc',
      },
    });
  }

  async findOne(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async update(
    userId: string,
    id: string,
    updateTransactionDto: UpdateTransactionDto,
  ) {
    await this.findOne(userId, id);
    await this.ensureCategoryBelongsToUser(
      userId,
      updateTransactionDto.categoryId,
    );
    await this.ensureAccountBelongsToUser(
      userId,
      updateTransactionDto.accountId,
    );

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.update({
        where: { id },
        data: {
        type: updateTransactionDto.type,
        amount: updateTransactionDto.amount,
        description: updateTransactionDto.description,
        categoryId:
          updateTransactionDto.categoryId === undefined
            ? undefined
            : updateTransactionDto.categoryId,
        accountId:
          updateTransactionDto.accountId === undefined
            ? undefined
            : updateTransactionDto.accountId,
        paymentMethod:
          updateTransactionDto.paymentMethod === undefined
            ? undefined
            : updateTransactionDto.paymentMethod,
        occurredAt: updateTransactionDto.occurredAt
          ? new Date(updateTransactionDto.occurredAt)
          : undefined,
        source: updateTransactionDto.source,
        },
      });
      await this.activities.record(tx, {
        userId, type: 'transaction_updated', entityType: 'transaction', entityId: transaction.id,
        title: 'Transação atualizada', description: transaction.description,
        metadata: { amount: transaction.amount.toFixed(2), transactionType: transaction.type }, occurredAt: transaction.occurredAt,
      });
      return transaction;
    });
  }

  async remove(userId: string, id: string) {
    const current = await this.findOne(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.delete({ where: { id } });
      await this.activities.record(tx, {
        userId, type: 'transaction_deleted', entityType: 'transaction', entityId: id,
        title: 'Transação removida', description: current.description,
        metadata: { amount: current.amount.toFixed(2), transactionType: current.type }, occurredAt: new Date(),
      });
    });

    return { deleted: true };
  }

  private async ensureCategoryBelongsToUser(
    userId: string,
    categoryId?: string | null,
  ) {
    if (!categoryId) {
      return;
    }

    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!category) {
      throw new BadRequestException('Invalid categoryId');
    }
  }

  private async ensureAccountBelongsToUser(
    userId: string,
    accountId?: string | null,
  ) {
    if (!accountId) {
      return;
    }

    const account = await this.prisma.account.findFirst({
      where: {
        id: accountId,
        userId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!account) {
      throw new BadRequestException('Invalid accountId');
    }
  }
}
