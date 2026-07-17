import { Injectable, Logger } from '@nestjs/common';
import { NotificationEvaluatorService } from './notification-evaluator.service';

/** Runs derived notification projections only after a domain transaction commits. */
@Injectable()
export class NotificationImpactService {
  private readonly logger = new Logger(NotificationImpactService.name);

  constructor(private readonly evaluator: NotificationEvaluatorService) {}

  evaluateInvoice(userId: string, invoiceId: string, asOf = new Date()) { return this.run('invoice', invoiceId, () => this.evaluator.evaluateInvoice(userId, invoiceId, asOf)); }
  evaluateFinancialEvent(userId: string, eventId: string, asOf = new Date()) { return this.run('financial event', eventId, () => this.evaluator.evaluateFinancialEvent(userId, eventId, asOf)); }
  evaluateSubscriptionCharge(userId: string, chargeId: string, asOf = new Date()) { return this.run('subscription charge', chargeId, () => this.evaluator.evaluateSubscriptionCharge(userId, chargeId, asOf)); }
  evaluateBudget(userId: string, budgetId: string, asOf = new Date()) { return this.run('budget', budgetId, () => this.evaluator.evaluateBudget(userId, budgetId, asOf)); }
  evaluateBudgetsForCategoryMonth(userId: string, categoryId: string | null | undefined, year: number, month: number, asOf = new Date()) {
    if (!categoryId) return Promise.resolve();
    return this.run('budget category/month', `${categoryId}:${year}-${month}`, async () => {
      const budgets = await this.evaluator.findBudgetIds(userId, categoryId, year, month);
      for (const budgetId of budgets) {
        await this.run('budget', budgetId, () => this.evaluator.evaluateBudget(userId, budgetId, asOf));
      }
    });
  }
  evaluateGoal(userId: string, goalId: string, asOf = new Date()) { return this.run('goal', goalId, () => this.evaluator.evaluateGoal(userId, goalId, asOf)); }

  private async run(source: string, id: string, evaluate: () => Promise<unknown>) {
    try { await evaluate(); }
    catch (error) { this.logger.error(`Immediate notification evaluation failed for ${source} ${id}`, error instanceof Error ? error.stack : undefined); }
  }
}
