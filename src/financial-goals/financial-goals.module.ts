import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { FinancialAnalyticsModule } from '../financial-analytics/financial-analytics.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FinancialGoalsController } from './financial-goals.controller';
import { FinancialGoalsService } from './financial-goals.service';

@Module({
  imports: [PrismaModule, ActivitiesModule, FinancialAnalyticsModule, NotificationsModule],
  controllers: [FinancialGoalsController],
  providers: [FinancialGoalsService],
  exports: [FinancialAnalyticsModule],
})
export class FinancialGoalsModule {}
