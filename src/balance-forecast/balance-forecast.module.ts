import { Module } from '@nestjs/common';
import { FinancialTimelineModule } from '../financial-timeline/financial-timeline.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BalanceForecastController } from './balance-forecast.controller';
import { BalanceForecastService } from './balance-forecast.service';

@Module({
  imports: [PrismaModule, FinancialTimelineModule],
  controllers: [BalanceForecastController],
  providers: [BalanceForecastService],
  exports: [BalanceForecastService],
})
export class BalanceForecastModule {}
