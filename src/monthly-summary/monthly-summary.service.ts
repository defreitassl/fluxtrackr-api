import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MonthlySummaryQueryDto } from './dto/monthly-summary-query.dto';

@Injectable()
export class MonthlySummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string, query: MonthlySummaryQueryDto) {
    const { year, month } = query;
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const [
      fixedIncomeAggregate,
      fixedExpenseAggregate,
      transactionIncomeAggregate,
      transactionExpenseAggregate,
      expensesByCategory,
    ] = await Promise.all([
      this.prisma.fixedIncome.aggregate({
        where: { userId, isActive: true },
        _sum: { amount: true },
      }),
      this.prisma.fixedExpense.aggregate({
        where: { userId, isActive: true },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'income',
          occurredAt: { gte: startDate, lt: endDate },
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'expense',
          occurredAt: { gte: startDate, lt: endDate },
        },
        _sum: { amount: true },
      }),
      this.getExpensesByCategory(userId, startDate, endDate),
    ]);

    const fixedIncomeTotal = this.toNumber(fixedIncomeAggregate._sum.amount);
    const fixedExpenseTotal = this.toNumber(fixedExpenseAggregate._sum.amount);
    const transactionIncomeTotal = this.toNumber(
      transactionIncomeAggregate._sum.amount,
    );
    const transactionExpenseTotal = this.toNumber(
      transactionExpenseAggregate._sum.amount,
    );
    const availableBalance =
      fixedIncomeTotal +
      transactionIncomeTotal -
      fixedExpenseTotal -
      transactionExpenseTotal;
    const { currentDay, remainingDays } = this.getMonthProgress(
      year,
      month,
      daysInMonth,
    );

    return {
      year,
      month,
      fixedIncomeTotal,
      fixedExpenseTotal,
      transactionIncomeTotal,
      transactionExpenseTotal,
      availableBalance,
      daysInMonth,
      currentDay,
      remainingDays,
      suggestedDailyBudget: this.roundMoney(
        availableBalance / Math.max(remainingDays, 1),
      ),
      expensesByCategory,
    };
  }

  private async getExpensesByCategory(
    userId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const groupedExpenses = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: 'expense',
        occurredAt: { gte: startDate, lt: endDate },
      },
      _sum: { amount: true },
      orderBy: {
        _sum: {
          amount: 'desc',
        },
      },
    });

    const categoryIds = groupedExpenses
      .map((expense) => expense.categoryId)
      .filter((categoryId): categoryId is string => Boolean(categoryId));
    const categories = await this.prisma.category.findMany({
      where: { userId, id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const categoryNameById = new Map(
      categories.map((category) => [category.id, category.name]),
    );

    return groupedExpenses.map((expense) => ({
      categoryId: expense.categoryId,
      categoryName: expense.categoryId
        ? (categoryNameById.get(expense.categoryId) ?? 'Categoria removida')
        : 'Sem categoria',
      total: this.toNumber(expense._sum.amount),
    }));
  }

  private getMonthProgress(year: number, month: number, daysInMonth: number) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (year === currentYear && month === currentMonth) {
      const currentDay = now.getDate();

      return {
        currentDay,
        remainingDays: Math.max(daysInMonth - currentDay, 0),
      };
    }

    return {
      currentDay: daysInMonth,
      remainingDays: daysInMonth,
    };
  }

  private toNumber(value: Prisma.Decimal | null) {
    return this.roundMoney(value ? value.toNumber() : 0);
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }
}

