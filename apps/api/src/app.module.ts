import { Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    // Rate limit mặc định cho toàn API. Route auth sẽ siết chặt hơn bằng
    // @Throttle riêng, vì đó là chỗ bị brute-force.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
