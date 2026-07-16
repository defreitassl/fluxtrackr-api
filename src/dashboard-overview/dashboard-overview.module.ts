import { Module } from '@nestjs/common';
import { BalanceForecastModule } from '../balance-forecast/balance-forecast.module';
import { CategoryBudgetsModule } from '../category-budgets/category-budgets.module';
import { FinancialTimelineModule } from '../financial-timeline/financial-timeline.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardOverviewController } from './dashboard-overview.controller';
import { DashboardOverviewService } from './dashboard-overview.service';

@Module({
  imports: [PrismaModule, BalanceForecastModule, FinancialTimelineModule, CategoryBudgetsModule],
  controllers: [DashboardOverviewController],
  providers: [DashboardOverviewService],
})
export class DashboardOverviewModule {}
