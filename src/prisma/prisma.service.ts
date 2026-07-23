import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { environment } from '../config/env';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({
      connectionString: environment.databaseUrl,
      max: environment.databasePoolMax,
      idleTimeoutMillis: environment.databasePoolIdleTimeoutMs,
      connectionTimeoutMillis: environment.databaseConnectionTimeoutMs,
    });

    super({ adapter });
  }

  async onModuleInit() {
    this.logger.log(
      JSON.stringify({
        event: 'prisma_pool_configured',
        max: environment.databasePoolMax,
        idleTimeoutMs: environment.databasePoolIdleTimeoutMs,
        connectionTimeoutMs: environment.databaseConnectionTimeoutMs,
      }),
    );
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
