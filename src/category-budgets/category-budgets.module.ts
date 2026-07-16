import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CategoryBudgetSpendingService } from './category-budget-spending.service';
import { CategoryBudgetsController } from './category-budgets.controller';
import { CategoryBudgetsService } from './category-budgets.service';

@Module({
  imports: [PrismaModule],
  controllers: [CategoryBudgetsController],
  providers: [CategoryBudgetsService, CategoryBudgetSpendingService],
  exports: [CategoryBudgetSpendingService],
})
export class CategoryBudgetsModule {}
