import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountTransferDto } from './dto/create-account-transfer.dto';
import { ListAccountTransfersDto } from './dto/list-account-transfers.dto';

@Injectable()
export class AccountTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject('ACCOUNT_TRANSFERS_NOW')
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(userId: string, dto: CreateAccountTransferDto) {
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : this.now();
    if (occurredAt > this.now()) {
      throw new BadRequestException('Future account transfers are not supported');
    }
    if (dto.sourceAccountId === dto.destinationAccountId) {
      throw new BadRequestException('Source and destination accounts must be different');
    }
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Transfer amount must be greater than zero');
    }
    return this.runSerializableTransaction(async (tx) => {
      const accounts = await tx.account.findMany({
        where: {
          id: { in: [dto.sourceAccountId, dto.destinationAccountId] },
          userId,
          isActive: true,
        },
        select: { id: true },
      });
      if (accounts.length !== 2) throw new BadRequestException('Invalid account');
      return tx.accountTransfer.create({
        data: {
          userId,
          sourceAccountId: dto.sourceAccountId,
          destinationAccountId: dto.destinationAccountId,
          amount,
          description: dto.description,
          occurredAt,
        },
      });
    });
  }

  findMany(userId: string, filters: ListAccountTransfersDto) {
    return this.prisma.accountTransfer.findMany({
      where: {
        userId,
        sourceAccountId: filters.sourceAccountId,
        destinationAccountId: filters.destinationAccountId,
        OR: filters.accountId
          ? [
              { sourceAccountId: filters.accountId },
              { destinationAccountId: filters.accountId },
            ]
          : undefined,
        occurredAt: filters.startDate || filters.endDate
          ? {
              gte: filters.startDate ? new Date(filters.startDate) : undefined,
              lte: filters.endDate ? new Date(filters.endDate) : undefined,
            }
          : undefined,
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
  }

  async findOne(userId: string, id: string) {
    const transfer = await this.prisma.accountTransfer.findFirst({
      where: { id, userId },
    });
    if (!transfer) throw new NotFoundException('Account transfer not found');
    return transfer;
  }

  private async runSerializableTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 3) continue;
          throw new ConflictException('Account transfer conflict');
        }
        throw error;
      }
    }
    throw new ConflictException('Account transfer conflict');
  }
}
