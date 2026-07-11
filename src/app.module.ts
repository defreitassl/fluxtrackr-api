import { Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { CreditCardsModule } from './credit-cards/credit-cards.module';
import { CreditCardPurchasesModule } from './credit-card-purchases/credit-card-purchases.module';
import { CreditCardInvoicesModule } from './credit-card-invoices/credit-card-invoices.module';
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
    CreditCardsModule,
    CreditCardPurchasesModule,
    CreditCardInvoicesModule,
    TransactionsModule,
    CategoriesModule,
    FixedExpensesModule,
    FixedIncomesModule,
    MonthlySummaryModule,
  ],
})
export class AppModule {}
