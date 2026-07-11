import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { calculateCreditCardInvoiceTotal } from '../credit-card-invoices/credit-card-invoice-total';
import { PrismaService } from '../prisma/prisma.service';
import {
  FinancialTimelineSourceTypeDto,
  ListFinancialTimelineDto,
} from './dto/list-financial-timeline.dto';

type TimelineType = 'income' | 'expense' | 'transfer' | 'adjustment';
type BalanceImpact = 'realized' | 'projected' | 'informational' | 'none';

export type TimelineItem = {
  id: string;
  sourceType: FinancialTimelineSourceTypeDto;
  sourceId: string;
  type: TimelineType;
  title: string;
  amount: string;
  date: string;
  status: string;
  balanceImpact: BalanceImpact;
  accountId: string | null;
  creditCardId: string | null;
  categoryId: string | null;
  metadata: Record<string, unknown>;
};

export type FinancialTimelineOptions = { referenceDate?: Date };

const DAY_IN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FinancialTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    userId: string,
    query: ListFinancialTimelineDto,
    options?: FinancialTimelineOptions,
  ) {
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);
    this.validateRange(startDate, endDate);

    const includes = (sourceType: FinancialTimelineSourceTypeDto) =>
      !query.sourceType || query.sourceType === sourceType;
    const includesExpense = !query.type || query.type === 'expense';
    const includesIncome = !query.type || query.type === 'income';
    const includesTransfer = !query.type || query.type === 'transfer';
    const includesAdjustment = !query.type || query.type === 'adjustment';
    const dateRange = { gte: startDate, lte: endDate };

    const includeFixedExpense = includesExpense && includes(FinancialTimelineSourceTypeDto.fixed_expense);
    const includeFixedIncome = includesIncome && includes(FinancialTimelineSourceTypeDto.fixed_income);
    const [transactions, events, invoices, fixedOccurrences, transfers, adjustments] =
      await Promise.all([
        (includesExpense || includesIncome) && includes(FinancialTimelineSourceTypeDto.transaction)
          ? this.prisma.transaction.findMany({
              where: { userId, type: query.type as 'income' | 'expense' | undefined, occurredAt: dateRange },
            })
          : Promise.resolve([]),
        (includesExpense || includesIncome) && includes(FinancialTimelineSourceTypeDto.financial_event)
          ? this.prisma.financialEvent.findMany({
              where: {
                userId,
                type: query.type as 'income' | 'expense' | undefined,
                date: dateRange,
                status: {
                  in: query.includeCanceled
                    ? ['planned', 'confirmed', 'postponed', 'canceled']
                    : ['planned', 'confirmed', 'postponed'],
                },
                confirmedTransactionId: null,
                confirmedCreditCardPurchaseId: null,
              },
            })
          : Promise.resolve([]),
        includesExpense &&
        includes(FinancialTimelineSourceTypeDto.credit_card_invoice)
          ? this.prisma.creditCardInvoice.findMany({
              where: {
                userId,
                dueDate: dateRange,
                status: query.includeCanceled
                  ? undefined
                  : { not: 'canceled' },
              },
              include: {
                creditCard: {
                  select: {
                    id: true,
                    name: true,
                    bankName: true,
                    brand: true,
                    lastFourDigits: true,
                  },
                },
                installments: {
                  select: { installmentAmount: true, status: true },
                },
              },
            })
          : Promise.resolve([]),
        includeFixedExpense || includeFixedIncome
          ? this.prisma.fixedOccurrence.findMany({
              where: {
                userId,
                type: query.type as 'income' | 'expense' | undefined,
                occurrenceDate: dateRange,
                status: { in: query.includeCanceled ? ['pending', 'canceled'] : ['pending'] },
                OR: [
                  ...(includeFixedExpense ? [{ type: 'expense' as const, fixedExpense: { is: { isActive: true } } }] : []),
                  ...(includeFixedIncome ? [{ type: 'income' as const, fixedIncome: { is: { isActive: true } } }] : []),
                  ...(query.includeCanceled && includeFixedExpense ? [{ type: 'expense' as const, status: 'canceled' as const }] : []),
                  ...(query.includeCanceled && includeFixedIncome ? [{ type: 'income' as const, status: 'canceled' as const }] : []),
                ],
              },
            })
          : Promise.resolve([]),
        includesTransfer && includes(FinancialTimelineSourceTypeDto.account_transfer)
          ? this.prisma.accountTransfer.findMany({
              where: { userId, occurredAt: dateRange },
            })
          : Promise.resolve([]),
        includesAdjustment && includes(FinancialTimelineSourceTypeDto.account_balance_adjustment)
          ? this.prisma.accountBalanceAdjustment.findMany({
              where: { userId, occurredAt: dateRange },
            })
          : Promise.resolve([]),
      ]);

    const items: TimelineItem[] = [
      ...transactions.map((transaction) => ({
        id: transaction.id,
        sourceType: FinancialTimelineSourceTypeDto.transaction,
        sourceId: transaction.id,
        type: transaction.type,
        title: transaction.description,
        amount: transaction.amount.toFixed(2),
        date: transaction.occurredAt.toISOString(),
        status: 'realized',
        balanceImpact: 'realized' as const,
        accountId: transaction.accountId,
        creditCardId: null,
        categoryId: transaction.categoryId,
        metadata: { paymentMethod: transaction.paymentMethod, source: transaction.source },
      })),
      ...events.map((event) => ({
        id: event.id,
        sourceType: FinancialTimelineSourceTypeDto.financial_event,
        sourceId: event.id,
        type: event.type,
        title: event.name,
        amount: event.expectedAmount.toFixed(2),
        date: event.date.toISOString(),
        status: event.status,
        balanceImpact: event.status === 'canceled' ? ('none' as const) : ('projected' as const),
        accountId: event.accountId,
        creditCardId: event.creditCardId,
        categoryId: event.categoryId,
        metadata: { recurrence: event.recurrence, installmentCount: event.installmentCount },
      })),
      ...invoices.map((invoice) => {
        const total = calculateCreditCardInvoiceTotal(invoice.installments);
        const installmentCount = invoice.installments.filter(
          (installment) => installment.status !== 'canceled',
        ).length;
        return {
          id: invoice.id,
          sourceType: FinancialTimelineSourceTypeDto.credit_card_invoice,
          sourceId: invoice.id,
          type: 'expense' as const,
          title: `Fatura ${invoice.creditCard.name} - ${String(invoice.month).padStart(2, '0')}/${invoice.year}`,
          amount: total.toFixed(2),
          date: invoice.dueDate.toISOString(),
          status: invoice.status,
          balanceImpact:
            invoice.status === 'paid'
              ? ('informational' as const)
              : invoice.status === 'canceled'
                ? ('none' as const)
                : ('projected' as const),
          accountId: invoice.accountId,
          creditCardId: invoice.creditCardId,
          categoryId: null,
          metadata: { installmentCount, creditCard: invoice.creditCard },
        };
      }),
      ...fixedOccurrences.map((occurrence) => ({
        id: occurrence.id,
        sourceType: occurrence.type === 'expense' ? FinancialTimelineSourceTypeDto.fixed_expense : FinancialTimelineSourceTypeDto.fixed_income,
        sourceId: occurrence.type === 'expense' ? occurrence.fixedExpenseId! : occurrence.fixedIncomeId!,
        type: occurrence.type,
        title: occurrence.name,
        amount: occurrence.amount.toFixed(2),
        date: occurrence.occurrenceDate.toISOString(),
        status: occurrence.status,
        balanceImpact: occurrence.status === 'canceled' ? ('none' as const) : ('projected' as const),
        accountId: occurrence.accountId,
        creditCardId: null,
        categoryId: occurrence.categoryId,
        metadata: {
          occurrenceId: occurrence.id,
          fixedExpenseId: occurrence.fixedExpenseId,
          fixedIncomeId: occurrence.fixedIncomeId,
          paymentMethod: occurrence.paymentMethod,
          expectedDate: occurrence.occurrenceDate.toISOString(),
        },
      })),
      ...transfers.map((transfer) => ({
        id: transfer.id,
        sourceType: FinancialTimelineSourceTypeDto.account_transfer,
        sourceId: transfer.id,
        type: 'transfer' as const,
        title: transfer.description ?? 'Transferência',
        amount: transfer.amount.toFixed(2),
        date: transfer.occurredAt.toISOString(),
        status: 'realized',
        balanceImpact: 'informational' as const,
        accountId: null,
        creditCardId: null,
        categoryId: null,
        metadata: {
          sourceAccountId: transfer.sourceAccountId,
          destinationAccountId: transfer.destinationAccountId,
          description: transfer.description,
        },
      })),
      ...adjustments.map((adjustment) => ({
        id: adjustment.id,
        sourceType: FinancialTimelineSourceTypeDto.account_balance_adjustment,
        sourceId: adjustment.id,
        type: 'adjustment' as const,
        title: adjustment.reason ?? 'Ajuste de saldo',
        amount: adjustment.difference.toFixed(2),
        date: adjustment.occurredAt.toISOString(),
        status: 'realized',
        balanceImpact: 'informational' as const,
        accountId: adjustment.accountId,
        creditCardId: null,
        categoryId: null,
        metadata: {
          accountId: adjustment.accountId,
          previousBalance: adjustment.previousBalance.toFixed(2),
          newBalance: adjustment.newBalance.toFixed(2),
          difference: adjustment.difference.toFixed(2),
          reason: adjustment.reason,
        },
      })),
    ];

    items.sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.sourceType.localeCompare(right.sourceType) ||
        left.id.localeCompare(right.id),
    );

    const summary = {
      realizedIncome: new Prisma.Decimal(0),
      realizedExpense: new Prisma.Decimal(0),
      projectedIncome: new Prisma.Decimal(0),
      projectedExpense: new Prisma.Decimal(0),
    };
    for (const item of items) {
      if (
        (item.type !== 'income' && item.type !== 'expense') ||
        (item.balanceImpact !== 'realized' && item.balanceImpact !== 'projected')
      ) continue;
      const key = `${item.balanceImpact}${item.type === 'income' ? 'Income' : 'Expense'}` as keyof typeof summary;
      summary[key] = summary[key].plus(item.amount);
    }

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      items,
      summary: Object.fromEntries(
        Object.entries(summary).map(([key, value]) => [key, value.toFixed(2)]),
      ),
    };
  }

  private validateRange(startDate: Date, endDate: Date) {
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }
    if (endDate.getTime() - startDate.getTime() > 366 * DAY_IN_MS) {
      throw new BadRequestException('Timeline range cannot exceed 366 days');
    }
  }

}
