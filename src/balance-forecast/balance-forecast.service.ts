import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinancialTimelineService, TimelineItem } from '../financial-timeline/financial-timeline.service';
import { AccountBalanceService } from '../account-balances/account-balance.service';
import { GetBalanceForecastDto } from './dto/get-balance-forecast.dto';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const ZERO = () => new Prisma.Decimal(0);

type Movement = { date: string; type: 'income' | 'expense'; amount: string };

export function buildBalanceForecast(
  asOf: Date,
  horizonDays: number,
  currentBalance: Prisma.Decimal,
  items: TimelineItem[],
) {
  const movements: Movement[] = items
    .filter(
      (item): item is TimelineItem & { type: 'income' | 'expense' } =>
        item.balanceImpact === 'projected' &&
        (item.type === 'income' || item.type === 'expense'),
    )
    .map((item) => ({ date: item.date.slice(0, 10), type: item.type, amount: item.amount }));
  const totalsByDate = new Map<string, { income: Prisma.Decimal; expense: Prisma.Decimal }>();
  for (const movement of movements) {
    const totals = totalsByDate.get(movement.date) ?? { income: ZERO(), expense: ZERO() };
    totals[movement.type] = totals[movement.type].plus(movement.amount);
    totalsByDate.set(movement.date, totals);
  }

  const startDay = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const requiredDays = Math.max(horizonDays, 30);
  let balance = currentBalance;
  let minimumBalance = currentBalance;
  let firstNegativeDate: string | null = null;
  let projectedIncome = ZERO();
  let projectedExpense = ZERO();
  const windowTotals = {
    next7Days: { income: ZERO(), expense: ZERO(), balance: currentBalance },
    next30Days: { income: ZERO(), expense: ZERO(), balance: currentBalance },
  };
  const points = [];

  for (let index = 0; index < requiredDays; index += 1) {
    const date = new Date(startDay + index * DAY_IN_MS).toISOString().slice(0, 10);
    const totals = totalsByDate.get(date) ?? { income: ZERO(), expense: ZERO() };
    balance = balance.plus(totals.income).minus(totals.expense);
    if (index < horizonDays) {
      if (balance.lessThan(minimumBalance)) minimumBalance = balance;
      if (!firstNegativeDate && balance.lessThan(0)) firstNegativeDate = date;
      projectedIncome = projectedIncome.plus(totals.income);
      projectedExpense = projectedExpense.plus(totals.expense);
      points.push({
        date,
        income: totals.income.toFixed(2),
        expense: totals.expense.toFixed(2),
        netChange: totals.income.minus(totals.expense).toFixed(2),
        balance: balance.toFixed(2),
      });
    }
    if (index < 7) {
      windowTotals.next7Days.income = windowTotals.next7Days.income.plus(totals.income);
      windowTotals.next7Days.expense = windowTotals.next7Days.expense.plus(totals.expense);
      windowTotals.next7Days.balance = balance;
    }
    if (index < 30) {
      windowTotals.next30Days.income = windowTotals.next30Days.income.plus(totals.income);
      windowTotals.next30Days.expense = windowTotals.next30Days.expense.plus(totals.expense);
      windowTotals.next30Days.balance = balance;
    }
  }

  const formatWindow = (window: typeof windowTotals.next7Days) => ({
    projectedIncome: window.income.toFixed(2),
    projectedExpense: window.expense.toFixed(2),
    projectedFinalBalance: window.balance.toFixed(2),
  });
  return {
    asOf: asOf.toISOString(),
    horizonDays,
    currentBalance: currentBalance.toFixed(2),
    projectedIncome: projectedIncome.toFixed(2),
    projectedExpense: projectedExpense.toFixed(2),
    projectedFinalBalance: currentBalance.plus(projectedIncome).minus(projectedExpense).toFixed(2),
    minimumProjectedBalance: minimumBalance.toFixed(2),
    firstNegativeDate,
    windows: {
      next7Days: formatWindow(windowTotals.next7Days),
      next30Days: formatWindow(windowTotals.next30Days),
    },
    points,
  };
}

@Injectable()
export class BalanceForecastService {
  constructor(
    private readonly timeline: FinancialTimelineService,
    private readonly balances: AccountBalanceService,
  ) {}

  async getForecast(userId: string, query: GetBalanceForecastDto) {
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    const horizonDays = query.horizonDays ?? 30;
    const timelineDays = Math.max(horizonDays, 30);
    const startDay = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
    const endDate = new Date(startDay + timelineDays * DAY_IN_MS - 1);

    const [currentBalance, timeline] = await Promise.all([
      this.balances.getConsolidatedBalance(userId, asOf),
      this.timeline.findMany(userId, {
        startDate: new Date(startDay).toISOString(),
        endDate: endDate.toISOString(),
        includeCanceled: false,
      }, { referenceDate: asOf }),
    ]);

    return buildBalanceForecast(asOf, horizonDays, currentBalance, timeline.items);
  }
}
