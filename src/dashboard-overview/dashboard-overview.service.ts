import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BalanceForecastService } from '../balance-forecast/balance-forecast.service';
import { calculateCreditCardInvoiceTotal } from '../credit-card-invoices/credit-card-invoice-total';
import { FinancialTimelineService } from '../financial-timeline/financial-timeline.service';
import { PrismaService } from '../prisma/prisma.service';
import { GetDashboardOverviewDto } from './dto/get-dashboard-overview.dto';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const ZERO = () => new Prisma.Decimal(0);

export type DailySpendingStatus =
  | 'within_plan'
  | 'over_plan'
  | 'no_available_balance';

export function getUtcDashboardBoundaries(asOf: Date) {
  const dayStart = new Date(Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth(),
    asOf.getUTCDate(),
  ));
  const monthEnd = new Date(Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth() + 1,
    1,
  ) - 1);
  const daysRemainingInMonth = monthEnd.getUTCDate() - asOf.getUTCDate() + 1;
  const commitmentsEnd = new Date(dayStart.getTime() + 30 * DAY_IN_MS - 1);
  return { dayStart, monthEnd, commitmentsEnd, daysRemainingInMonth };
}

export function buildDashboardBalance(
  totalBalance: Prisma.Decimal,
  committed: Prisma.Decimal,
  spentToday: Prisma.Decimal,
  daysRemainingInMonth: number,
) {
  const availableToSpend = totalBalance.minus(committed);
  const availableBeforeTodaySpending = availableToSpend.plus(spentToday);
  const recommended = availableBeforeTodaySpending.greaterThan(0)
    ? availableBeforeTodaySpending.dividedBy(daysRemainingInMonth)
    : ZERO();
  const remainingToday = recommended.minus(spentToday);
  const status: DailySpendingStatus = availableBeforeTodaySpending.lessThanOrEqualTo(0)
    ? 'no_available_balance'
    : spentToday.greaterThan(recommended)
      ? 'over_plan'
      : 'within_plan';

  return {
    balance: {
      total: totalBalance.toFixed(2),
      committed: committed.toFixed(2),
      availableToSpend: availableToSpend.toFixed(2),
    },
    dailySpending: {
      recommended: recommended.toFixed(2),
      spentToday: spentToday.toFixed(2),
      remainingToday: remainingToday.toFixed(2),
      daysRemainingInMonth,
      status,
    },
  };
}

@Injectable()
export class DashboardOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly forecast: BalanceForecastService,
    private readonly timeline: FinancialTimelineService,
  ) {}

  async getOverview(userId: string, query: GetDashboardOverviewDto) {
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    const { dayStart, monthEnd, commitmentsEnd, daysRemainingInMonth } =
      getUtcDashboardBoundaries(asOf);
    const pendingInvoiceStatuses = ['open', 'closed', 'overdue'] as const;

    const [
      forecast,
      invoices,
      fixedOccurrences,
      financialEvents,
      subscriptionCharges,
      spentTodayTransactions,
      spentTodayCardInstallments,
      timeline,
      latestTransactions,
      latestTransfers,
      latestAdjustments,
    ] = await Promise.all([
      this.forecast.getForecast(userId, {
        asOf: asOf.toISOString(),
        horizonDays: 30,
      }),
      this.prisma.creditCardInvoice.findMany({
        where: { userId, status: { in: [...pendingInvoiceStatuses] } },
        select: {
          id: true,
          creditCardId: true,
          dueDate: true,
          status: true,
          creditCard: { select: { name: true } },
          installments: {
            select: { installmentAmount: true, status: true },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.fixedOccurrence.findMany({
        where: {
          userId,
          type: 'expense',
          status: 'pending',
          occurrenceDate: { lte: monthEnd },
          fixedExpense: { is: { isActive: true } },
        },
        select: { amount: true },
      }),
      this.prisma.financialEvent.findMany({
        where: {
          userId,
          type: 'expense',
          status: 'confirmed',
          date: { lte: monthEnd },
        },
        select: { expectedAmount: true },
      }),
      this.prisma.subscriptionCharge.findMany({
        where: { userId, status: 'pending', chargeDate: { lte: monthEnd } },
        select: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'expense',
          occurredAt: { gte: dayStart, lte: asOf },
          account: { is: { userId, isActive: true } },
          paidCreditCardInvoice: { is: null },
          realizedFixedOccurrence: { is: null },
          confirmedFinancialEvent: { is: null },
          realizedSubscriptionCharge: { is: null },
        },
        _sum: { amount: true },
      }),
      this.prisma.installment.aggregate({
        where: {
          userId,
          status: { not: 'canceled' },
          invoice: { is: { dueDate: { lte: monthEnd } } },
          purchase: {
            is: {
              userId,
              purchaseDate: { gte: dayStart, lte: asOf },
              confirmedFinancialEvent: { is: null },
              realizedSubscriptionCharge: { is: null },
            },
          },
        },
        _sum: { installmentAmount: true },
      }),
      this.timeline.findMany(
        userId,
        {
          startDate: dayStart.toISOString(),
          endDate: commitmentsEnd.toISOString(),
          includeCanceled: false,
        },
        { referenceDate: asOf },
      ),
      this.prisma.transaction.findMany({
        where: {
          userId,
          occurredAt: { lte: asOf },
          account: { is: { userId, isActive: true } },
        },
        select: {
          id: true,
          type: true,
          amount: true,
          description: true,
          occurredAt: true,
          paymentMethod: true,
          source: true,
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, type: true } },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
      this.prisma.accountTransfer.findMany({
        where: { userId, occurredAt: { lte: asOf } },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
      this.prisma.accountBalanceAdjustment.findMany({
        where: { userId, occurredAt: { lte: asOf } },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
    ]);

    const invoiceTotals = invoices.map((invoice) => ({
      invoice,
      amount: calculateCreditCardInvoiceTotal(invoice.installments),
      installmentsCount: invoice.installments.filter(
        (installment) => installment.status !== 'canceled',
      ).length,
    }));
    const committedInvoices = invoiceTotals
      .filter(({ invoice }) => invoice.dueDate <= monthEnd)
      .reduce((total, entry) => total.plus(entry.amount), ZERO());
    const committedOccurrences = fixedOccurrences.reduce(
      (total, occurrence) => total.plus(occurrence.amount),
      ZERO(),
    );
    const committedEvents = financialEvents.reduce(
      (total, event) => total.plus(event.expectedAmount),
      ZERO(),
    );
    const committedSubscriptions = subscriptionCharges.reduce(
      (total, charge) => total.plus(charge.amount),
      ZERO(),
    );
    const committed = committedInvoices
      .plus(committedOccurrences)
      .plus(committedEvents)
      .plus(committedSubscriptions);
    const totalBalance = new Prisma.Decimal(forecast.currentBalance);
    const spentToday = (spentTodayTransactions._sum.amount ?? ZERO())
      .plus(spentTodayCardInstallments._sum.installmentAmount ?? ZERO());
    const financialSummary = buildDashboardBalance(
      totalBalance,
      committed,
      spentToday,
      daysRemainingInMonth,
    );
    const nextInvoiceEntry = invoiceTotals.find((entry) => entry.amount.greaterThan(0));
    const latestMovements = [
      ...latestTransactions.map((transaction) => ({
        id: transaction.id,
        sourceType: 'transaction' as const,
        type: transaction.type,
        title: transaction.description,
        amount: transaction.amount.toFixed(2),
        date: transaction.occurredAt.toISOString(),
        accountId: transaction.account?.id ?? null,
        sourceAccountId: null,
        destinationAccountId: null,
      })),
      ...latestTransfers.map((transfer) => ({
        id: transfer.id,
        sourceType: 'account_transfer' as const,
        type: 'transfer' as const,
        title: transfer.description ?? 'Transferência',
        amount: transfer.amount.toFixed(2),
        date: transfer.occurredAt.toISOString(),
        accountId: null,
        sourceAccountId: transfer.sourceAccountId,
        destinationAccountId: transfer.destinationAccountId,
      })),
      ...latestAdjustments.map((adjustment) => ({
        id: adjustment.id,
        sourceType: 'account_balance_adjustment' as const,
        type: 'adjustment' as const,
        title: adjustment.reason ?? 'Ajuste de saldo',
        amount: adjustment.difference.toFixed(2),
        date: adjustment.occurredAt.toISOString(),
        accountId: adjustment.accountId,
        sourceAccountId: null,
        destinationAccountId: null,
      })),
    ]
      .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))
      .slice(0, 5);

    return {
      asOf: asOf.toISOString(),
      ...financialSummary,
      forecast30Days: {
        projectedFinalBalance: forecast.projectedFinalBalance,
        minimumProjectedBalance: forecast.minimumProjectedBalance,
        firstNegativeDate: forecast.firstNegativeDate,
      },
      nextInvoice: nextInvoiceEntry
        ? {
            id: nextInvoiceEntry.invoice.id,
            creditCardId: nextInvoiceEntry.invoice.creditCardId,
            creditCardName: nextInvoiceEntry.invoice.creditCard.name,
            dueDate: nextInvoiceEntry.invoice.dueDate.toISOString(),
            status: nextInvoiceEntry.invoice.status,
            amount: nextInvoiceEntry.amount.toFixed(2),
            installmentsCount: nextInvoiceEntry.installmentsCount,
          }
        : null,
      upcomingCommitments: timeline.items
        .filter(
          (item) =>
            item.balanceImpact === 'projected' &&
            item.sourceType !== 'credit_card_invoice',
        )
        .slice(0, 5)
        .map((item) => ({
          id: item.id,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          type: item.type,
          title: item.title,
          amount: item.amount,
          date: item.date,
          status: item.status,
          categoryId: item.categoryId,
          accountId: item.accountId,
        })),
      latestTransactions: latestTransactions.map((transaction) => ({
        ...transaction,
        amount: transaction.amount.toFixed(2),
        occurredAt: transaction.occurredAt.toISOString(),
      })),
      latestMovements,
    };
  }
}
