import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getBudgetPeriod } from './category-budget-period';

const zero = () => new Prisma.Decimal(0);

export type CategorySpending = {
  transactionSpent: Prisma.Decimal;
  creditCardSpent: Prisma.Decimal;
  totalSpent: Prisma.Decimal;
};

export type CategoryBudgetStatus = 'within_budget' | 'near_limit' | 'exceeded';

export type CategoryBudgetSummary = {
  totalLimit: string;
  totalSpent: string;
  totalRemaining: string;
  usagePercentage: string;
  budgetsCount: number;
  withinBudgetCount: number;
  nearLimitCount: number;
  exceededCount: number;
};

type BudgetForSummary = {
  categoryId: string;
  limitAmount: Prisma.Decimal;
  warningPercentage: number;
};

export function getBudgetStatus(
  spentAmount: Prisma.Decimal,
  limitAmount: Prisma.Decimal,
  warningPercentage: number,
): CategoryBudgetStatus {
  if (spentAmount.greaterThanOrEqualTo(limitAmount)) return 'exceeded';
  if (spentAmount.dividedBy(limitAmount).times(100).greaterThanOrEqualTo(warningPercentage)) return 'near_limit';
  return 'within_budget';
}

@Injectable()
export class CategoryBudgetSpendingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSpendingByCategory(
    userId: string,
    year: number,
    month: number,
    asOf: Date,
  ): Promise<Map<string, CategorySpending>> {
    const { monthStart, realizedUntil } = getBudgetPeriod(year, month, asOf);
    if (!realizedUntil) return new Map();

    const [transactions, installments] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: {
          userId,
          type: 'expense',
          categoryId: { not: null },
          occurredAt: { gte: monthStart, lte: realizedUntil },
          paidCreditCardInvoice: { is: null },
        },
        _sum: { amount: true },
      }),
      this.prisma.installment.groupBy({
        by: ['categoryId'],
        where: {
          userId,
          categoryId: { not: null },
          status: { not: 'canceled' },
          invoice: {
            is: { userId, year, month, status: { not: 'canceled' } },
          },
          purchase: { is: { purchaseDate: { lte: realizedUntil } } },
        },
        _sum: { installmentAmount: true },
      }),
    ]);

    const spending = new Map<string, CategorySpending>();
    for (const entry of transactions) {
      if (!entry.categoryId) continue;
      const transactionSpent = entry._sum.amount ?? zero();
      spending.set(entry.categoryId, {
        transactionSpent,
        creditCardSpent: zero(),
        totalSpent: transactionSpent,
      });
    }
    for (const entry of installments) {
      if (!entry.categoryId) continue;
      const creditCardSpent = entry._sum.installmentAmount ?? zero();
      const current = spending.get(entry.categoryId) ?? {
        transactionSpent: zero(), creditCardSpent: zero(), totalSpent: zero(),
      };
      current.creditCardSpent = current.creditCardSpent.plus(creditCardSpent);
      current.totalSpent = current.transactionSpent.plus(current.creditCardSpent);
      spending.set(entry.categoryId, current);
    }
    return spending;
  }

  buildSummary(
    budgets: BudgetForSummary[],
    spending: Map<string, CategorySpending>,
  ): CategoryBudgetSummary {
    const totals = budgets.reduce((current, budget) => {
      const spent = spending.get(budget.categoryId)?.totalSpent ?? zero();
      const status = getBudgetStatus(spent, budget.limitAmount, budget.warningPercentage);
      return {
        totalLimit: current.totalLimit.plus(budget.limitAmount),
        totalSpent: current.totalSpent.plus(spent),
        withinBudgetCount: current.withinBudgetCount + Number(status === 'within_budget'),
        nearLimitCount: current.nearLimitCount + Number(status === 'near_limit'),
        exceededCount: current.exceededCount + Number(status === 'exceeded'),
      };
    }, { totalLimit: zero(), totalSpent: zero(), withinBudgetCount: 0, nearLimitCount: 0, exceededCount: 0 });
    const totalRemaining = totals.totalLimit.minus(totals.totalSpent);
    const usagePercentage = totals.totalLimit.greaterThan(0)
      ? totals.totalSpent.dividedBy(totals.totalLimit).times(100)
      : zero();
    return {
      totalLimit: totals.totalLimit.toFixed(2),
      totalSpent: totals.totalSpent.toFixed(2),
      totalRemaining: totalRemaining.toFixed(2),
      usagePercentage: usagePercentage.toFixed(2),
      budgetsCount: budgets.length,
      withinBudgetCount: totals.withinBudgetCount,
      nearLimitCount: totals.nearLimitCount,
      exceededCount: totals.exceededCount,
    };
  }

  async getBudgetSummary(userId: string, year: number, month: number, asOf: Date) {
    const [budgets, spending] = await Promise.all([
      this.prisma.categoryBudget.findMany({
        where: { userId, year, month, isActive: true },
        select: { categoryId: true, limitAmount: true, warningPercentage: true },
      }),
      this.getSpendingByCategory(userId, year, month, asOf),
    ]);
    return this.buildSummary(budgets, spending);
  }
}
