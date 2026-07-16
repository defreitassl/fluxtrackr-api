import { Injectable } from '@nestjs/common';
import { ActivityEntityType, ActivityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ActivityInput = { userId: string; type: ActivityType; entityType: ActivityEntityType; entityId: string; title: string; description?: string | null; metadata?: Prisma.InputJsonValue; occurredAt: Date };
@Injectable()
export class ActivityService {
  record(client: PrismaService | Prisma.TransactionClient, input: ActivityInput) { return client.activity.create({ data: input }); }
}
