import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { calculateCreditCardInvoiceTotal } from '../credit-card-invoices/credit-card-invoice-total';
import { CategoryBudgetSpendingService, getBudgetStatus } from '../category-budgets/category-budget-spending.service';
import { FinancialGoalProgressService } from '../financial-goals/financial-goal-progress.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPreferencesService } from '../notification-preferences/notification-preferences.service';
import { NotificationsService, NotificationUpsert } from './notifications.service';

type Db = PrismaService | Prisma.TransactionClient;
const day = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
const dateKey = (value: Date) => day(value).toISOString().slice(0, 10);

@Injectable()
export class NotificationEvaluatorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationEvaluatorService.name);
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService, private readonly preferences: NotificationPreferencesService, private readonly spending: CategoryBudgetSpendingService, private readonly goals: FinancialGoalProgressService) {}
  async onApplicationBootstrap() { await this.evaluateAllUsers(new Date()); }
  @Cron('15 * * * *', { timeZone: 'UTC' }) async evaluateHourly() { await this.evaluateAllUsers(new Date()); }
  async evaluateAllUsers(asOf: Date) {
    const users = await this.prisma.user.findMany({ select: { id: true } });
    for (const user of users) {
      await this.safeEvaluate('user', user.id, () => this.evaluateUser(user.id, asOf));
    }
  }
  async evaluateUser(userId: string, asOf: Date, client: Db = this.prisma) {
    const [invoices, events, charges, budgets, goals] = await Promise.all([
      client.creditCardInvoice.findMany({ where: { userId }, select: { id: true } }), client.financialEvent.findMany({ where: { userId }, select: { id: true } }), client.subscriptionCharge.findMany({ where: { userId }, select: { id: true } }), client.categoryBudget.findMany({ where: { userId }, select: { id: true } }), client.financialGoal.findMany({ where: { userId }, select: { id: true } }),
    ]);
    for (const row of invoices) await this.safeEvaluate('credit_card_invoice', row.id, () => this.evaluateInvoice(userId, row.id, asOf, client));
    for (const row of events) await this.safeEvaluate('financial_event', row.id, () => this.evaluateFinancialEvent(userId, row.id, asOf, client));
    for (const row of charges) await this.safeEvaluate('subscription_charge', row.id, () => this.evaluateSubscriptionCharge(userId, row.id, asOf, client));
    for (const row of budgets) await this.safeEvaluate('category_budget', row.id, () => this.evaluateBudget(userId, row.id, asOf, client));
    for (const row of goals) await this.safeEvaluate('financial_goal', row.id, () => this.evaluateGoal(userId, row.id, asOf, client));
  }
  async safeEvaluate(sourceType: string, sourceId: string, evaluation: () => Promise<unknown>): Promise<void> {
    try { await evaluation(); }
    catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Notification evaluation failed for ${sourceType} ${sourceId}`, stack);
    }
  }
  async findBudgetIds(userId: string, categoryId: string, year: number, month: number) { return (await this.prisma.categoryBudget.findMany({ where: { userId, categoryId, year, month }, select: { id: true } })).map((item) => item.id); }
  async evaluateInvoice(userId: string, invoiceId: string, asOf: Date, client: Db = this.prisma) {
    const invoice = await client.creditCardInvoice.findFirst({ where: { id: invoiceId, userId }, include: { creditCard: { select: { name: true } }, installments: { select: { installmentAmount: true, status: true } } } });
    if (!invoice) return this.notifications.resolveSource(client, userId, 'credit_card_invoice', invoiceId, asOf);
    const total = calculateCreditCardInvoiceTotal(invoice.installments); const due = day(invoice.dueDate); const current = day(asOf);
    if (!['open', 'closed', 'overdue'].includes(invoice.status) || total.lessThanOrEqualTo(0)) return this.notifications.resolveSource(client, userId, 'credit_card_invoice', invoiceId, asOf);
    const preference = await this.preferences.getEffective(userId, 'invoices', client);
    const overdue = due < current; const upcoming = !overdue && due <= new Date(current.getTime() + (preference.leadDays ?? 3) * 86_400_000);
    if (!overdue && !upcoming) return this.notifications.resolveSource(client, userId, 'credit_card_invoice', invoiceId, asOf);
    const type = overdue ? 'invoice_overdue' : 'invoice_due_soon';
    const dedupeKey = `${type}:${invoice.id}:${dateKey(invoice.dueDate)}`;
    await this.notifications.resolveSourceExceptDedupeKey(client, userId, 'credit_card_invoice', invoice.id, dedupeKey, asOf);
    await this.notifications.resolveTypesExcept(client, userId, 'credit_card_invoice', invoice.id, type, asOf);
    if (!preference.enabled) return;
    return this.activate(client, userId, { category: 'invoices', type, severity: overdue ? 'critical' : 'warning', title: overdue ? 'Fatura vencida' : 'Fatura próxima do vencimento', message: overdue ? `Fatura ${invoice.creditCard.name} venceu em ${dateKey(invoice.dueDate)}.` : `Fatura ${invoice.creditCard.name} vence em ${dateKey(invoice.dueDate)}.`, sourceType: 'credit_card_invoice', sourceId: invoice.id, dedupeKey, scheduledFor: invoice.dueDate });
  }
  async evaluateFinancialEvent(userId: string, eventId: string, asOf: Date, client: Db = this.prisma) {
    const event = await client.financialEvent.findFirst({ where: { id: eventId, userId } }); const type = 'financial_event_upcoming' as const;
    if (!event) return this.notifications.resolveSource(client, userId, 'financial_event', eventId, asOf); const pref = await this.preferences.getEffective(userId, 'events', client); const current = day(asOf); const active = event.status === 'confirmed' && day(event.date) >= current && day(event.date) <= new Date(current.getTime() + (pref.leadDays ?? 3) * 86_400_000);
    if (!active) return this.notifications.resolveSource(client, userId, 'financial_event', eventId, asOf);
    const dedupeKey = `event_upcoming:${event.id}:${dateKey(event.date)}`;
    await this.notifications.resolveSourceExceptDedupeKey(client, userId, 'financial_event', event.id, dedupeKey, asOf);
    await this.notifications.resolveTypesExcept(client, userId, 'financial_event', event.id, type, asOf);
    if (!pref.enabled) return;
    return this.activate(client, userId, { category: 'events', type, severity: 'info', title: 'Evento financeiro próximo', message: `${event.name} está previsto para ${dateKey(event.date)}.`, sourceType: 'financial_event', sourceId: event.id, dedupeKey, scheduledFor: event.date });
  }
  async evaluateSubscriptionCharge(userId: string, chargeId: string, asOf: Date, client: Db = this.prisma) {
    const charge = await client.subscriptionCharge.findFirst({ where: { id: chargeId, userId } });
    if (!charge) return this.notifications.resolveSource(client, userId, 'subscription_charge', chargeId, asOf); const pref = await this.preferences.getEffective(userId, 'subscriptions', client); const current = day(asOf); const overdue = charge.status === 'pending' && day(charge.chargeDate) < current; const upcoming = charge.status === 'pending' && !overdue && day(charge.chargeDate) <= new Date(current.getTime() + (pref.leadDays ?? 3) * 86_400_000);
    if (!overdue && !upcoming) return this.notifications.resolveSource(client, userId, 'subscription_charge', chargeId, asOf);
    const type = overdue ? 'subscription_charge_overdue' : 'subscription_charge_upcoming';
    const dedupeKey = `${overdue ? 'subscription_overdue' : 'subscription_upcoming'}:${charge.id}:${dateKey(charge.chargeDate)}`;
    await this.notifications.resolveSourceExceptDedupeKey(client, userId, 'subscription_charge', charge.id, dedupeKey, asOf);
    await this.notifications.resolveTypesExcept(client, userId, 'subscription_charge', charge.id, type, asOf);
    if (!pref.enabled) return;
    return this.activate(client, userId, { category: 'subscriptions', type, severity: overdue ? 'critical' : 'warning', title: overdue ? 'Cobrança vencida' : 'Cobrança próxima', message: overdue ? `${charge.name} estava prevista para ${dateKey(charge.chargeDate)} e continua pendente.` : `${charge.name} será cobrada em ${dateKey(charge.chargeDate)}.`, sourceType: 'subscription_charge', sourceId: charge.id, dedupeKey, scheduledFor: charge.chargeDate });
  }
  async evaluateBudget(userId: string, budgetId: string, asOf: Date, client: Db = this.prisma) {
    const budget = await client.categoryBudget.findFirst({ where: { id: budgetId, userId }, include: { category: true } });
    if (!budget || !budget.isActive || !budget.category.isActive || budget.year !== asOf.getUTCFullYear() || budget.month !== asOf.getUTCMonth() + 1) return this.notifications.resolveSource(client, userId, 'category_budget', budgetId, asOf);
    const spending = await this.spending.getSpendingByCategory(userId, budget.year, budget.month, asOf); const status = getBudgetStatus(spending.get(budget.categoryId)?.totalSpent ?? new Prisma.Decimal(0), budget.limitAmount, budget.warningPercentage); if (status === 'within_budget') return this.notifications.resolveSource(client, userId, 'category_budget', budgetId, asOf);
    const type = status === 'exceeded' ? 'budget_exceeded' : 'budget_near_limit';
    const dedupeKey = `${type}:${budget.id}:${budget.year}-${String(budget.month).padStart(2, '0')}`;
    await this.notifications.resolveSourceExceptDedupeKey(client, userId, 'category_budget', budget.id, dedupeKey, asOf);
    await this.notifications.resolveTypesExcept(client, userId, 'category_budget', budget.id, type, asOf);
    const pref = await this.preferences.getEffective(userId, 'budgets', client); if (!pref.enabled) return;
    return this.activate(client, userId, { category: 'budgets', type, severity: type === 'budget_exceeded' ? 'critical' : 'warning', title: type === 'budget_exceeded' ? 'Orçamento excedido' : 'Orçamento próximo do limite', message: `Orçamento de ${budget.category.name} no limite em ${budget.year}-${String(budget.month).padStart(2, '0')}.`, sourceType: 'category_budget', sourceId: budget.id, dedupeKey, scheduledFor: null });
  }
  async evaluateGoal(userId: string, goalId: string, asOf: Date, client: Db = this.prisma) {
    const goal = await client.financialGoal.findFirst({ where: { id: goalId, userId } });
    if (!goal || goal.status !== 'active' || !goal.targetDate) return this.notifications.resolveSource(client, userId, 'financial_goal', goalId, asOf); const progress = await this.goals.getGoalProgress(client, goal); if (progress.currentAmount.greaterThanOrEqualTo(goal.targetAmount)) return this.notifications.resolveSource(client, userId, 'financial_goal', goalId, asOf);
    const pref = await this.preferences.getEffective(userId, 'goals', client); const current = day(asOf); const overdue = day(goal.targetDate) < current; const upcoming = !overdue && day(goal.targetDate) <= new Date(current.getTime() + (pref.leadDays ?? 30) * 86_400_000); if (!overdue && !upcoming) return this.notifications.resolveSource(client, userId, 'financial_goal', goalId, asOf);
    const type = overdue ? 'goal_overdue' : 'goal_deadline_upcoming';
    const dedupeKey = `${overdue ? 'goal_overdue' : 'goal_deadline_upcoming'}:${goal.id}:${dateKey(goal.targetDate)}`;
    await this.notifications.resolveSourceExceptDedupeKey(client, userId, 'financial_goal', goal.id, dedupeKey, asOf);
    await this.notifications.resolveTypesExcept(client, userId, 'financial_goal', goal.id, type, asOf);
    if (!pref.enabled) return;
    return this.activate(client, userId, { category: 'goals', type, severity: overdue ? 'critical' : 'warning', title: overdue ? 'Meta vencida' : 'Prazo da meta próximo', message: `${goal.name} tem prazo em ${dateKey(goal.targetDate)}.`, sourceType: 'financial_goal', sourceId: goal.id, dedupeKey, scheduledFor: goal.targetDate });
  }
  private activate(client: Db, userId: string, input: NotificationUpsert) { return this.notifications.upsertActive(client, userId, input); }
}
