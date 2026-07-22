import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MeService } from './me.service';

const baseUser = {
  id: 'user-1',
  name: 'Douglas Freitas',
  email: 'douglas@example.com',
  passwordHash: bcrypt.hashSync('senha-atual', 4),
  createdAt: new Date('2026-01-10T12:00:00.000Z'),
  updatedAt: new Date('2026-01-10T12:00:00.000Z'),
};

function harness(overrides: { user?: typeof baseUser | null } = {}) {
  const user = overrides.user === undefined ? { ...baseUser } : overrides.user;
  const calls: { update?: { where: unknown; data: Record<string, unknown> } } = {};
  const prisma = {
    user: {
      findUnique: async () => user,
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        calls.update = args;
        return { ...baseUser, ...args.data };
      },
    },
  } as unknown as PrismaService;

  return { service: new MeService(prisma), calls };
}

describe('MeService', () => {
  it('returns the authenticated user without the password hash', async () => {
    const { service } = harness();
    const me = await service.getMe('user-1');

    assert.deepEqual(me, {
      id: 'user-1',
      name: 'Douglas Freitas',
      email: 'douglas@example.com',
      createdAt: '2026-01-10T12:00:00.000Z',
    });
    assert.equal('passwordHash' in me, false);
  });

  it('throws NotFound when the user does not exist', async () => {
    const { service } = harness({ user: null });
    await assert.rejects(service.getMe('missing'), NotFoundException);
  });

  it('updates only the trimmed name', async () => {
    const { service, calls } = harness();
    const me = await service.updateMe('user-1', { name: '  Novo Nome  ' });

    assert.deepEqual(calls.update?.data, { name: 'Novo Nome' });
    assert.equal(me.name, 'Novo Nome');
  });

  it('changes the password after validating the current one', async () => {
    const { service, calls } = harness();
    const result = await service.changePassword('user-1', {
      currentPassword: 'senha-atual',
      newPassword: 'senha-nova-123',
    });

    assert.deepEqual(result, { updated: true });
    const newHash = calls.update?.data.passwordHash as string;
    assert.ok(newHash && newHash !== baseUser.passwordHash);
    assert.ok(bcrypt.compareSync('senha-nova-123', newHash));
  });

  it('rejects password change when the current password is wrong', async () => {
    const { service, calls } = harness();
    await assert.rejects(
      service.changePassword('user-1', {
        currentPassword: 'errada',
        newPassword: 'senha-nova-123',
      }),
      BadRequestException,
    );
    assert.equal(calls.update, undefined);
  });
});
