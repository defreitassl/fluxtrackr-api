import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FixedOccurrencesModule } from '../fixed-occurrences/fixed-occurrences.module';
import { FixedIncomesController } from './fixed-incomes.controller';
import { FixedIncomesService } from './fixed-incomes.service';

@Module({
  imports: [PrismaModule, FixedOccurrencesModule],
  controllers: [FixedIncomesController],
  providers: [FixedIncomesService],
})
export class FixedIncomesModule {}
