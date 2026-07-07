import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, createTransactionDto: CreateTransactionDto) {
    await this.ensureCategoryBelongsToUser(
      userId,
      createTransactionDto.categoryId,
    );

    return this.prisma.transaction.create({
      data: {
        userId,
        type: createTransactionDto.type,
        amount: createTransactionDto.amount,
        description: createTransactionDto.description,
        categoryId: createTransactionDto.categoryId,
        occurredAt: createTransactionDto.occurredAt
          ? new Date(createTransactionDto.occurredAt)
          : new Date(),
        source: createTransactionDto.source,
      },
    });
  }

  findMany(userId: string, filters: ListTransactionsDto) {
    const where: Prisma.TransactionWhereInput = {
      userId,
      type: filters.type,
      categoryId: filters.categoryId,
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

    return this.prisma.transaction.update({
      where: { id },
      data: {
        type: updateTransactionDto.type,
        amount: updateTransactionDto.amount,
        description: updateTransactionDto.description,
        categoryId:
          updateTransactionDto.categoryId === undefined
            ? undefined
            : updateTransactionDto.categoryId,
        occurredAt: updateTransactionDto.occurredAt
          ? new Date(updateTransactionDto.occurredAt)
          : undefined,
        source: updateTransactionDto.source,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.transaction.delete({ where: { id } });

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
}
