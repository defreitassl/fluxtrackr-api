import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type BalanceClient = PrismaService | Prisma.TransactionClient;

const zero = () => new Prisma.Decimal(0);

@Injectable()
export class AccountBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccountBalance(
    userId: string,
    accountId: string,
    asOf: Date,
    client: BalanceClient = this.prisma,
  ) {
    const account = await client.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true, initialBalance: true },
    });
    if (!account) throw new NotFoundException('Account not found');

    const [income, expense, incoming, outgoing, adjustments] = await Promise.all([
      client.transaction.aggregate({
        where: { userId, accountId, type: 'income', occurredAt: { lte: asOf } },
        _sum: { amount: true },
      }),
      client.transaction.aggregate({
        where: { userId, accountId, type: 'expense', occurredAt: { lte: asOf } },
        _sum: { amount: true },
      }),
      client.accountTransfer.aggregate({
        where: { userId, destinationAccountId: accountId, occurredAt: { lte: asOf } },
        _sum: { amount: true },
      }),
      client.accountTransfer.aggregate({
        where: { userId, sourceAccountId: accountId, occurredAt: { lte: asOf } },
        _sum: { amount: true },
      }),
      client.accountBalanceAdjustment.aggregate({
        where: { userId, accountId, occurredAt: { lte: asOf } },
        _sum: { difference: true },
      }),
    ]);

    const values = {
      initialBalance: account.initialBalance,
      income: income._sum.amount ?? zero(),
      expense: expense._sum.amount ?? zero(),
      incomingTransfers: incoming._sum.amount ?? zero(),
      outgoingTransfers: outgoing._sum.amount ?? zero(),
      adjustments: adjustments._sum.difference ?? zero(),
    };
    return {
      accountId,
      asOf,
      ...values,
      currentBalance: values.initialBalance
        .plus(values.income)
        .minus(values.expense)
        .plus(values.incomingTransfers)
        .minus(values.outgoingTransfers)
        .plus(values.adjustments),
    };
  }

  async getConsolidatedBalance(
    userId: string,
    asOf: Date,
    client: BalanceClient = this.prisma,
  ) {
    const activeAccount = { userId, isActive: true };
    const [accounts, income, expense, incoming, outgoing, adjustments] =
      await Promise.all([
        client.account.aggregate({
          where: activeAccount,
          _sum: { initialBalance: true },
        }),
        client.transaction.aggregate({
          where: {
            userId,
            type: 'income',
            occurredAt: { lte: asOf },
            account: { is: activeAccount },
          },
          _sum: { amount: true },
        }),
        client.transaction.aggregate({
          where: {
            userId,
            type: 'expense',
            occurredAt: { lte: asOf },
            account: { is: activeAccount },
          },
          _sum: { amount: true },
        }),
        client.accountTransfer.aggregate({
          where: {
            userId,
            occurredAt: { lte: asOf },
            destinationAccount: { is: activeAccount },
          },
          _sum: { amount: true },
        }),
        client.accountTransfer.aggregate({
          where: {
            userId,
            occurredAt: { lte: asOf },
            sourceAccount: { is: activeAccount },
          },
          _sum: { amount: true },
        }),
        client.accountBalanceAdjustment.aggregate({
          where: {
            userId,
            occurredAt: { lte: asOf },
            account: { is: activeAccount },
          },
          _sum: { difference: true },
        }),
      ]);

    return (accounts._sum.initialBalance ?? zero())
      .plus(income._sum.amount ?? zero())
      .minus(expense._sum.amount ?? zero())
      .plus(incoming._sum.amount ?? zero())
      .minus(outgoing._sum.amount ?? zero())
      .plus(adjustments._sum.difference ?? zero());
  }
}
