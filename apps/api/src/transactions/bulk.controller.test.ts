import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

/**
 * Tầng HTTP của các route bulk.
 *
 * Có test riêng ở đây vì hai thứ chỉ sai được ở tầng này, không sai ở service:
 *
 *   `DELETE` mang body. Body của DELETE là hợp lệ theo HTTP nhưng không phải
 *   thư viện nào cũng parse — nếu Nest/Express bỏ nó thì route sẽ luôn 400 và
 *   không unit test nào của service phát hiện được.
 *
 *   `DELETE /api/transactions` không được che `DELETE /api/transactions/:id`.
 *   Thêm một route cùng method vào cùng controller là đúng lúc thứ tự khớp
 *   đường dẫn có thể đổi.
 *
 * Service là stub: ở đây không kiểm nghiệp vụ, chỉ kiểm request đi tới đúng chỗ
 * với đúng dữ liệu.
 */
const service = {
  bulkDelete: vi.fn(),
  bulkCategorize: vi.fn(),
  remove: vi.fn(),
};

let app: NestExpressApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [TransactionsController],
    providers: [{ provide: TransactionsService, useValue: service }],
  }).compile();

  app = moduleRef.createNestApplication<NestExpressApplication>();

  // Thay chỗ của JwtAuthGuard: `@CurrentUserId()` đọc `request.user.id`, không có
  // thì handler nổ trước khi tới phần đang test.
  app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.user = { id: 'user_1' };
    next();
  });

  await app.init();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DELETE /api/transactions', () => {
  it('nhận danh sách id ở body và trả về số dòng đã xoá', async () => {
    service.bulkDelete.mockResolvedValue({ deleted: 2 });

    const response = await request(app.getHttpServer())
      .delete('/api/transactions')
      .send({ transactionIds: ['tx_1', 'tx_2'] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deleted: 2 });
    expect(service.bulkDelete).toHaveBeenCalledWith('user_1', {
      transactionIds: ['tx_1', 'tx_2'],
    });
  });

  it('danh sách rỗng thì 400, không gọi xuống service', async () => {
    const response = await request(app.getHttpServer())
      .delete('/api/transactions')
      .send({ transactionIds: [] });

    expect(response.status).toBe(400);
    expect(service.bulkDelete).not.toHaveBeenCalled();
  });

  it('quá 500 id thì 400', async () => {
    const response = await request(app.getHttpServer())
      .delete('/api/transactions')
      .send({ transactionIds: Array.from({ length: 501 }, (_, i) => `tx_${i}`) });

    expect(response.status).toBe(400);
    expect(service.bulkDelete).not.toHaveBeenCalled();
  });
});

describe('route bulk không che route một id', () => {
  it('DELETE /api/transactions/:id vẫn vào đường xoá một giao dịch', async () => {
    service.remove.mockResolvedValue(undefined);

    const response = await request(app.getHttpServer()).delete('/api/transactions/tx_1');

    expect(response.status).toBe(204);
    expect(service.remove).toHaveBeenCalledWith('user_1', 'tx_1');
    expect(service.bulkDelete).not.toHaveBeenCalled();
  });

  it('PATCH bulk-categorize vẫn không bị bắt như một id', async () => {
    service.bulkCategorize.mockResolvedValue({ updated: 3 });

    const response = await request(app.getHttpServer())
      .patch('/api/transactions/bulk-categorize')
      .send({ transactionIds: ['tx_1'], categoryId: null });

    expect(response.status).toBe(200);
    expect(service.bulkCategorize).toHaveBeenCalled();
  });
});
