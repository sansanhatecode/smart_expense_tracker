import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { env, isProduction } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Một instance duy nhất cho cả process.
 *
 * Prisma 7 bỏ Rust engine nên bắt buộc dùng driver adapter — ở đây là PrismaPg
 * (node-postgres). Vì API là process long-running, pool của node-postgres sống
 * suốt đời process, không gặp vấn đề cạn connection như serverless.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
      log: isProduction ? ['warn', 'error'] : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Đã kết nối Postgres');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
