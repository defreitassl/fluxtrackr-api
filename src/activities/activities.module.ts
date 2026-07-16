import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ActivityService } from './activity.service';
@Module({ imports: [PrismaModule], controllers: [ActivitiesController], providers: [ActivityService, ActivitiesService], exports: [ActivityService] })
export class ActivitiesModule {}
