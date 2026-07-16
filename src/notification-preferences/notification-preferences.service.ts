import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

export const notificationDefaults: Record<NotificationCategory, { enabled: boolean; leadDays: number | null }> = {
  invoices: { enabled: true, leadDays: 3 }, events: { enabled: true, leadDays: 3 },
  subscriptions: { enabled: true, leadDays: 3 }, budgets: { enabled: true, leadDays: null }, goals: { enabled: true, leadDays: 30 },
};

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const persisted = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const byCategory = new Map(persisted.map((item) => [item.category, item]));
    return { preferences: Object.values(NotificationCategory).map((category) => {
      const item = byCategory.get(category);
      return { category, enabled: item?.enabled ?? notificationDefaults[category].enabled, leadDays: item?.leadDays ?? notificationDefaults[category].leadDays };
    }) };
  }

  async update(userId: string, dto: UpdateNotificationPreferencesDto) {
    const categories = new Set<string>();
    for (const item of dto.preferences) {
      if (categories.has(item.category)) throw new BadRequestException('Notification categories must be unique');
      categories.add(item.category);
      if (item.category === 'budgets' && item.leadDays !== null && item.leadDays !== undefined) throw new BadRequestException('budgets must use leadDays null');
      if (item.category !== 'budgets' && (item.leadDays === null || item.leadDays === undefined || item.leadDays < 0 || item.leadDays > 90)) throw new BadRequestException('leadDays must be between 0 and 90');
    }
    await this.prisma.$transaction(dto.preferences.map((item) => this.prisma.notificationPreference.upsert({
      where: { userId_category: { userId, category: item.category } },
      create: { userId, category: item.category, enabled: item.enabled, leadDays: item.category === 'budgets' ? null : item.leadDays },
      update: { enabled: item.enabled, leadDays: item.category === 'budgets' ? null : item.leadDays },
    })));
    return this.findAll(userId);
  }

  async getEffective(userId: string, category: NotificationCategory, db: PrismaService | Prisma.TransactionClient = this.prisma) {
    const preference = await db.notificationPreference.findUnique({ where: { userId_category: { userId, category } } });
    return preference ?? notificationDefaults[category];
  }
}
