import { Module } from '@nestjs/common';
import { CategoryBudgetsModule } from '../category-budgets/category-budgets.module';
import { FinancialGoalsModule } from '../financial-goals/financial-goals.module';
import { NotificationPreferencesModule } from '../notification-preferences/notification-preferences.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationEvaluatorService } from './notification-evaluator.service';
import { NotificationsService } from './notifications.service';
@Module({ imports: [PrismaModule, NotificationPreferencesModule, CategoryBudgetsModule, FinancialGoalsModule], controllers: [NotificationsController], providers: [NotificationsService, NotificationEvaluatorService], exports: [NotificationsService, NotificationEvaluatorService] })
export class NotificationsModule {}
