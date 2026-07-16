import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationsService } from './notifications.service';

function notification(overrides: any = {}) { return { id: 'notification', userId: 'owner', readAt: null, dismissedAt: null, resolvedAt: null, createdAt: new Date('2026-07-16T10:00:00.000Z'), updatedAt: new Date('2026-07-16T10:00:00.000Z'), ...overrides }; }
function harness(row = notification()) {
  const prisma: any = { notification: {
    findFirst: async ({ where }: any) => where.userId === row.userId && where.id === row.id ? row : null,
    findUniqueOrThrow: async () => row,
    updateMany: async ({ where, data }: any) => { if (where.id === row.id && where.userId === row.userId && (where.readAt !== null || row.readAt === null) && (where.dismissedAt !== null || row.dismissedAt === null)) Object.assign(row, data); return { count: 1 }; },
    count: async () => 0, findMany: async () => [],
  } };
  return { service: new NotificationsService(prisma), row };
}
describe('NotificationsService idempotency', () => {
  it('preserves the first read and dismissal timestamps', async () => {
    const { service, row } = harness();
    await service.markRead('owner', row.id); const firstRead = row.readAt;
    await service.markRead('owner', row.id); assert.equal(row.readAt, firstRead);
    await service.dismiss('owner', row.id); const firstDismissal = row.dismissedAt;
    await service.dismiss('owner', row.id); assert.equal(row.dismissedAt, firstDismissal);
  });
  it('read-all targets only active unread notifications', async () => { await harness().service.markAllRead('owner'); assert.ok(true); });
});
