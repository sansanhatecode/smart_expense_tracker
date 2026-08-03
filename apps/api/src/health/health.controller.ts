import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/jwt-auth.guard';
import { HealthRepository } from './health.repository';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthRepository) {}

  /**
   * Health check có chạm DB thật.
   *
   * Một endpoint chỉ trả `{ok:true}` mà không kiểm tra DB sẽ báo xanh trong khi
   * app hoàn toàn không dùng được — vô dụng đúng lúc cần nó nhất.
   */
  @Get()
  async check(): Promise<{ status: string; database: string; uptime: number }> {
    await this.health.ping();
    return {
      status: 'ok',
      database: 'ok',
      uptime: Math.round(process.uptime()),
    };
  }
}
