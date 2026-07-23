import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FixedOccurrencesController } from './fixed-occurrences.controller';
import { FixedOccurrencesMaterializerService } from './fixed-occurrences-materializer.service';
import { FixedOccurrencesService } from './fixed-occurrences.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [FixedOccurrencesController],
  providers: [FixedOccurrencesService, FixedOccurrencesMaterializerService],
  exports: [FixedOccurrencesMaterializerService],
})
export class FixedOccurrencesModule {}
