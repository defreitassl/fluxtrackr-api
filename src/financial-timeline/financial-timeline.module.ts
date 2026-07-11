import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FinancialTimelineController } from './financial-timeline.controller';
import { FinancialTimelineService } from './financial-timeline.service';

@Module({
  imports: [PrismaModule],
  controllers: [FinancialTimelineController],
  providers: [FinancialTimelineService],
  exports: [FinancialTimelineService],
})
export class FinancialTimelineModule {}
