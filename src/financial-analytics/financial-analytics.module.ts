import { Module } from '@nestjs/common';
import { CategoryBudgetSpendingService } from '../category-budgets/category-budget-spending.service';
import { FinancialGoalProgressService } from '../financial-goals/financial-goal-progress.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [CategoryBudgetSpendingService, FinancialGoalProgressService],
  exports: [CategoryBudgetSpendingService, FinancialGoalProgressService],
})
export class FinancialAnalyticsModule {}
