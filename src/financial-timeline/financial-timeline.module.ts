import { Module } from '@nestjs/common';
import { FinancialTimelineController } from './financial-timeline.controller';
import { FinancialTimelineService } from './financial-timeline.service';

@Module({
  controllers: [FinancialTimelineController],
  providers: [FinancialTimelineService],
})
export class FinancialTimelineModule {}
