import { Module } from '@nestjs/common';
import { FinancialAnalyticsModule } from '../financial-analytics/financial-analytics.module';
import { ActivitiesModule } from '../activities/activities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CategoryBudgetsController } from './category-budgets.controller';
import { CategoryBudgetsService } from './category-budgets.service';

@Module({
  imports: [PrismaModule, FinancialAnalyticsModule, ActivitiesModule, NotificationsModule],
  controllers: [CategoryBudgetsController],
  providers: [CategoryBudgetsService],
  exports: [FinancialAnalyticsModule],
})
export class CategoryBudgetsModule {}
