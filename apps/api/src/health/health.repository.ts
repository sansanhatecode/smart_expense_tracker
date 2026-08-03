import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Truy vấn DB của health check. */
@Injectable()
export class HealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Ném lỗi nếu không nói chuyện được với Postgres. */
  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
