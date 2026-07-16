import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activities/activity.service';
import { NotificationImpactService } from '../notifications/notification-impact.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService, private readonly activities: ActivityService, private readonly impacts: NotificationImpactService) {}

  async create(userId: string, createTransactionDto: CreateTransactionDto) {
    await this.ensureCategoryBelongsToUser(
      userId,
      createTransactionDto.categoryId,
    );
    await this.ensureAccountBelongsToUser(userId, createTransactionDto.accountId);

    const transaction = await this.prisma.$transaction(async (tx) => {
      const actionAt = new Date();
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
        metadata: { amount: transaction.amount.toFixed(2), transactionType: transaction.type, accountId: transaction.accountId, categoryId: transaction.categoryId, effectiveDate: transaction.occurredAt.toISOString() }, occurredAt: actionAt,
      });
      return transaction;
    });
    await this.evaluateBudgetImpact(userId, transaction.categoryId, transaction.occurredAt);
    return transaction;
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
    await this.ensureCategoryBelongsToUser(
      userId,
      updateTransactionDto.categoryId,
    );
    await this.ensureAccountBelongsToUser(
      userId,
      updateTransactionDto.accountId,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.transaction.findFirst({ where: { id, userId } });
      if (!current) throw new NotFoundException('Transaction not found');
      const actionAt = new Date();
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
        metadata: { previousAmount: current.amount.toFixed(2), amount: transaction.amount.toFixed(2), transactionType: transaction.type, previousCategoryId: current.categoryId, categoryId: transaction.categoryId, previousAccountId: current.accountId, accountId: transaction.accountId, previousEffectiveDate: current.occurredAt.toISOString(), effectiveDate: transaction.occurredAt.toISOString() }, occurredAt: actionAt,
      });
      return { transaction, current };
    });
    await this.evaluateBudgetImpact(userId, result.current.categoryId, result.current.occurredAt);
    await this.evaluateBudgetImpact(userId, result.transaction.categoryId, result.transaction.occurredAt);
    return result.transaction;
  }

  async remove(userId: string, id: string) {
    const current = await this.findOne(userId, id);
    await this.prisma.$transaction(async (tx) => {
      const actionAt = new Date();
      await tx.transaction.delete({ where: { id } });
      await this.activities.record(tx, {
        userId, type: 'transaction_deleted', entityType: 'transaction', entityId: id,
        title: 'Transação removida', description: current.description,
        metadata: { amount: current.amount.toFixed(2), transactionType: current.type, accountId: current.accountId, categoryId: current.categoryId, effectiveDate: current.occurredAt.toISOString() }, occurredAt: actionAt,
      });
    });
    await this.evaluateBudgetImpact(userId, current.categoryId, current.occurredAt);

    return { deleted: true };
  }

  private async evaluateBudgetImpact(userId: string, categoryId: string | null, effectiveDate: Date) {
    await this.impacts.evaluateBudgetsForCategoryMonth(userId, categoryId, effectiveDate.getUTCFullYear(), effectiveDate.getUTCMonth() + 1);
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
