import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationCategory, NotificationSeverity, NotificationSourceType, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';

export type NotificationUpsert = { category: NotificationCategory; type: NotificationType; severity: NotificationSeverity; title: string; message: string; sourceType: NotificationSourceType; sourceId: string; dedupeKey: string; scheduledFor?: Date | null };
type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(userId: string, query: ListNotificationsDto) {
    const cursor = query.cursor ? await this.prisma.notification.findFirst({ where: { id: query.cursor, userId }, select: { id: true, createdAt: true } }) : null;
    if (query.cursor && !cursor) throw new BadRequestException('Invalid notification cursor');
    const where: Prisma.NotificationWhereInput = {
      userId, category: query.category, type: query.type, severity: query.severity,
      ...(query.isRead === undefined ? {} : query.isRead ? { readAt: { not: null } } : { readAt: null }),
      ...(query.includeResolved ? {} : { resolvedAt: null }), ...(query.includeDismissed ? {} : { dismissedAt: null }),
      ...(query.startDate || query.endDate ? { createdAt: { ...(query.startDate ? { gte: new Date(query.startDate) } : {}), ...(query.endDate ? { lte: new Date(query.endDate) } : {}) } } : {}),
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
    };
    const take = query.limit ?? 30;
    const rows = await this.prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1 });
    const items = rows.slice(0, take).map((item) => this.serialize(item));
    return { items, nextCursor: rows.length > take ? rows[take - 1].id : null };
  }

  async unreadCount(userId: string) { return { unreadCount: await this.prisma.notification.count({ where: { userId, readAt: null, dismissedAt: null, resolvedAt: null } }) }; }
  async markRead(userId: string, id: string) {
    await this.requireOwned(userId, id);
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return this.serialize(await this.prisma.notification.findUniqueOrThrow({ where: { id } }));
  }
  async markAllRead(userId: string) { const result = await this.prisma.notification.updateMany({ where: { userId, readAt: null, dismissedAt: null, resolvedAt: null }, data: { readAt: new Date() } }); return { updatedCount: result.count }; }
  async dismiss(userId: string, id: string) {
    await this.requireOwned(userId, id);
    await this.prisma.notification.updateMany({ where: { id, userId, dismissedAt: null }, data: { dismissedAt: new Date() } });
    return { dismissed: true };
  }

  upsertActive(db: Db, userId: string, input: NotificationUpsert) {
    return db.notification.upsert({ where: { userId_dedupeKey: { userId, dedupeKey: input.dedupeKey } }, create: { userId, ...input }, update: { category: input.category, type: input.type, severity: input.severity, title: input.title, message: input.message, sourceType: input.sourceType, sourceId: input.sourceId, scheduledFor: input.scheduledFor ?? null, resolvedAt: null } });
  }
  resolveSource(
    db: Db,
    userId: string,
    sourceType: NotificationSourceType,
    sourceId: string,
    now: Date,
  ) {
    return db.notification.updateMany({
      where: { userId, sourceType, sourceId, resolvedAt: null },
      data: { resolvedAt: now },
    });
  }

  resolveSourceExceptDedupeKey(
    db: Db,
    userId: string,
    sourceType: NotificationSourceType,
    sourceId: string,
    activeDedupeKey: string,
    now: Date,
  ) {
    return db.notification.updateMany({
      where: {
        userId,
        sourceType,
        sourceId,
        dedupeKey: { not: activeDedupeKey },
        resolvedAt: null,
      },
      data: { resolvedAt: now },
    });
  }

  resolveTypesExcept(
    db: Db,
    userId: string,
    sourceType: NotificationSourceType,
    sourceId: string,
    activeType: NotificationType,
    now: Date,
  ) {
    return db.notification.updateMany({
      where: {
        userId,
        sourceType,
        sourceId,
        type: { not: activeType },
        resolvedAt: null,
      },
      data: { resolvedAt: now },
    });
  }
  private async requireOwned(userId: string, id: string) { if (!await this.prisma.notification.findFirst({ where: { id, userId }, select: { id: true } })) throw new NotFoundException('Notification not found'); }
  private serialize(row: any) { return { ...row, scheduledFor: row.scheduledFor?.toISOString() ?? null, readAt: row.readAt?.toISOString() ?? null, dismissedAt: row.dismissedAt?.toISOString() ?? null, resolvedAt: row.resolvedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
}
