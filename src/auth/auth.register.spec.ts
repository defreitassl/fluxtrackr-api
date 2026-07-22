import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

function harness({ existingUser = null }: { existingUser?: unknown } = {}) {
  const calls: { create?: { data: Record<string, string> } } = {};
  const prisma = {
    user: {
      findUnique: async () => existingUser,
      create: async (args: { data: Record<string, string> }) => {
        calls.create = args;
        return { id: 'user-1', email: args.data.email };
      },
    },
  } as unknown as PrismaService;
  const jwt = {
    signAsync: async (payload: Record<string, string>) => `jwt:${payload.sub}:${payload.email}`,
  } as unknown as JwtService;

  return { service: new AuthService(prisma, jwt), calls };
}

describe('AuthService.register', () => {
  it('creates the user with a bcrypt hash and returns an access token', async () => {
    const { service, calls } = harness();
    const result = await service.register({
      name: 'Douglas Freitas',
      email: 'novo@example.com',
      password: 'senha-segura-1',
    });

    assert.deepEqual(result, { accessToken: 'jwt:user-1:novo@example.com' });
    assert.equal(calls.create?.data.name, 'Douglas Freitas');
    assert.equal(calls.create?.data.email, 'novo@example.com');
    assert.notEqual(calls.create?.data.passwordHash, 'senha-segura-1');
    assert.ok(bcrypt.compareSync('senha-segura-1', calls.create!.data.passwordHash));
  });

  it('rejects duplicated emails with 409', async () => {
    const { service, calls } = harness({ existingUser: { id: 'user-1' } });
    await assert.rejects(
      service.register({ name: 'X', email: 'existe@example.com', password: 'senha-segura-1' }),
      ConflictException,
    );
    assert.equal(calls.create, undefined);
  });
});
