import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountBalanceService } from '../account-balances/account-balance.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountBalanceAdjustmentDto } from './dto/create-account-balance-adjustment.dto';

@Injectable()
export class AccountBalanceAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: AccountBalanceService,
  ) {}

  create(userId: string, accountId: string, dto: CreateAccountBalanceAdjustmentDto) {
    return this.runSerializableTransaction(async (tx) => {
      const account = await tx.account.findFirst({
        where: { id: accountId, userId, isActive: true },
        select: { id: true },
      });
      if (!account) throw new BadRequestException('Invalid accountId');
      const occurredAt = new Date();
      const previous = await this.balances.getAccountBalance(userId, accountId, occurredAt, tx);
      const newBalance = new Prisma.Decimal(dto.newBalance);
      const difference = newBalance.minus(previous.currentBalance);
      const adjustment = await tx.accountBalanceAdjustment.create({
        data: {
          userId,
          accountId,
          previousBalance: previous.currentBalance,
          newBalance,
          difference,
          reason: dto.reason,
          occurredAt,
        },
      });
      return { adjustment, currentBalance: newBalance.toFixed(2) };
    });
  }

  findMany(userId: string, accountId: string) {
    return this.prisma.accountBalanceAdjustment.findMany({
      where: { userId, accountId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
  }

  async getBalance(userId: string, accountId: string, asOf: Date) {
    const balance = await this.balances.getAccountBalance(userId, accountId, asOf);
    return {
      accountId,
      asOf: asOf.toISOString(),
      initialBalance: balance.initialBalance.toFixed(2),
      income: balance.income.toFixed(2),
      expense: balance.expense.toFixed(2),
      incomingTransfers: balance.incomingTransfers.toFixed(2),
      outgoingTransfers: balance.outgoingTransfers.toFixed(2),
      adjustments: balance.adjustments.toFixed(2),
      currentBalance: balance.currentBalance.toFixed(2),
    };
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
          throw new ConflictException('Account balance adjustment conflict');
        }
        throw error;
      }
    }
    throw new ConflictException('Account balance adjustment conflict');
  }
}
