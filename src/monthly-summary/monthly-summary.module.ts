import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MonthlySummaryController } from './monthly-summary.controller';
import { MonthlySummaryService } from './monthly-summary.service';

@Module({
  imports: [PrismaModule],
  controllers: [MonthlySummaryController],
  providers: [MonthlySummaryService],
})
export class MonthlySummaryModule {}

