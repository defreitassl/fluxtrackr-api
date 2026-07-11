import { Module } from '@nestjs/common';
import { FinancialTimelineModule } from '../financial-timeline/financial-timeline.module';
import { AccountBalancesModule } from '../account-balances/account-balances.module';
import { BalanceForecastController } from './balance-forecast.controller';
import { BalanceForecastService } from './balance-forecast.service';

@Module({
  imports: [FinancialTimelineModule, AccountBalancesModule],
  controllers: [BalanceForecastController],
  providers: [BalanceForecastService],
  exports: [BalanceForecastService],
})
export class BalanceForecastModule {}
