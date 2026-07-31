import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Health check có chạm DB thật.
   *
   * Một endpoint chỉ trả `{ok:true}` mà không kiểm tra DB sẽ báo xanh trong khi
   * app hoàn toàn không dùng được — vô dụng đúng lúc cần nó nhất.
   */
  @Get()
  async check(): Promise<{ status: string; database: string; uptime: number }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      database: 'ok',
      uptime: Math.round(process.uptime()),
    };
  }
}
