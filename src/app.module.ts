import { Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { FixedExpensesModule } from './fixed-expenses/fixed-expenses.module';
import { FixedIncomesModule } from './fixed-incomes/fixed-incomes.module';
import { HealthModule } from './health/health.module';
import { MonthlySummaryModule } from './monthly-summary/monthly-summary.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    HealthModule,
    AuthModule,
    AccountsModule,
    TransactionsModule,
    CategoriesModule,
    FixedExpensesModule,
    FixedIncomesModule,
    MonthlySummaryModule,
  ],
})
export class AppModule {}
