import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationImpactService } from './notification-impact.service';

describe('NotificationImpactService', () => {
  it('does not rethrow a failed post-commit evaluation', async () => {
    const evaluator: any = { evaluateInvoice: async () => { throw new Error('projection failed'); } };
    const service = new NotificationImpactService(evaluator);
    await service.evaluateInvoice('user', 'invoice');
    assert.ok(true);
  });

  it('continues budget category/month reconciliation after an individual failure', async () => {
    const evaluated: string[] = [];
    const evaluator: any = {
      findBudgetIds: async () => ['broken', 'healthy'],
      evaluateBudget: async (_user: string, id: string) => {
        if (id === 'broken') throw new Error('projection failed');
        evaluated.push(id);
      },
    };
    const service = new NotificationImpactService(evaluator);
    await service.evaluateBudgetsForCategoryMonth('user', 'category', 2026, 7);
    assert.deepEqual(evaluated, ['healthy']);
  });
});
