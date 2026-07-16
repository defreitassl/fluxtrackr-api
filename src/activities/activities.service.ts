import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListActivitiesDto } from './dto/list-activities.dto';
@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}
  async findMany(userId: string, query: ListActivitiesDto) {
    const cursor = query.cursor ? await this.prisma.activity.findFirst({ where: { id: query.cursor, userId }, select: { id: true, occurredAt: true } }) : null;
    const where: Prisma.ActivityWhereInput = { userId, type: query.type, entityType: query.entityType, entityId: query.entityId,
      ...(query.startDate || query.endDate ? { occurredAt: { ...(query.startDate ? { gte: new Date(query.startDate) } : {}), ...(query.endDate ? { lte: new Date(query.endDate) } : {}) } } : {}),
      ...(cursor ? { OR: [{ occurredAt: { lt: cursor.occurredAt } }, { occurredAt: cursor.occurredAt, id: { lt: cursor.id } }] } : {}) };
    const take = query.limit ?? 30;
    const rows = await this.prisma.activity.findMany({ where, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: take + 1 });
    return { items: rows.slice(0, take).map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString(), createdAt: row.createdAt.toISOString() })), nextCursor: rows.length > take ? rows[take - 1].id : null };
  }
}
