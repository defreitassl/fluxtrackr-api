import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountsModule } from './accounts/accounts.module';
import { AccountBalancesModule } from './account-balances/account-balances.module';
import { AccountBalanceAdjustmentsModule } from './account-balance-adjustments/account-balance-adjustments.module';
import { AccountTransfersModule } from './account-transfers/account-transfers.module';
import { BalanceForecastModule } from './balance-forecast/balance-forecast.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { CategoryBudgetsModule } from './category-budgets/category-budgets.module';
import { CreditCardsModule } from './credit-cards/credit-cards.module';
import { CreditCardPurchasesModule } from './credit-card-purchases/credit-card-purchases.module';
import { CreditCardInvoicesModule } from './credit-card-invoices/credit-card-invoices.module';
import { DashboardOverviewModule } from './dashboard-overview/dashboard-overview.module';
import { FixedExpensesModule } from './fixed-expenses/fixed-expenses.module';
import { FinancialEventsModule } from './financial-events/financial-events.module';
import { FinancialTimelineModule } from './financial-timeline/financial-timeline.module';
import { FixedIncomesModule } from './fixed-incomes/fixed-incomes.module';
import { FixedOccurrencesModule } from './fixed-occurrences/fixed-occurrences.module';
import { HealthModule } from './health/health.module';
import { MonthlySummaryModule } from './monthly-summary/monthly-summary.module';
import { TransactionsModule } from './transactions/transactions.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SubscriptionChargesModule } from './subscription-charges/subscription-charges.module';
import { FinancialGoalsModule } from './financial-goals/financial-goals.module';
import { MeModule } from './me/me.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NotificationPreferencesModule } from './notification-preferences/notification-preferences.module';
import { ActivitiesModule } from './activities/activities.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    HealthModule,
    AuthModule,
    MeModule,
    AccountsModule,
    AccountBalancesModule,
    AccountBalanceAdjustmentsModule,
    AccountTransfersModule,
    BalanceForecastModule,
    CreditCardsModule,
    CreditCardPurchasesModule,
    CreditCardInvoicesModule,
    DashboardOverviewModule,
    FinancialEventsModule,
    FinancialTimelineModule,
    TransactionsModule,
    CategoriesModule,
    CategoryBudgetsModule,
    FixedExpensesModule,
    FixedIncomesModule,
    FixedOccurrencesModule,
    MonthlySummaryModule,
    SubscriptionsModule,
    SubscriptionChargesModule,
    FinancialGoalsModule,
    NotificationPreferencesModule,
    NotificationsModule,
    ActivitiesModule,
  ],
})
export class AppModule {}
