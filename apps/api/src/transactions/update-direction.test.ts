import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';

/**
 * Quy tắc "danh mục phải cùng chiều với giao dịch", ở đường SỬA.
 *
 * Có file riêng vì đây là chỗ quy tắc đó từng thủng: kiểm tra cũ nằm trong
 * `if (input.categoryId)`, nên `PATCH { type }` một mình đi lọt — nó đổi chiều
 * giao dịch mà để nguyên danh mục cũ, và không có gì báo. Thống kê theo danh mục
 * với ngân sách sau đó nói hai con số khác nhau về cùng một giao dịch.
 *
 * Repository là stub: phần đáng test là quy tắc, không phải câu SQL.
 */
function serviceWith(stub: Partial<TransactionsRepository>) {
  return new TransactionsService(stub as TransactionsRepository);
}

const EXPENSE_CATEGORY = { id: 'cat_an_uong', type: 'expense' as const, name: 'Ăn uống' };
const INCOME_CATEGORY = { id: 'cat_luong', type: 'income' as const, name: 'Lương' };

/** Một khoản chi đang nằm trong danh mục chi — trạng thái hợp lệ. */
const EXPENSE_IN_EXPENSE_CATEGORY = {
  id: 'tx_1',
  type: 'expense' as const,
  categoryId: EXPENSE_CATEGORY.id,
};

describe('update — đổi chiều trong khi giữ nguyên danh mục', () => {
  it('chặn khi danh mục đang giữ không còn cùng chiều, và KHÔNG ghi gì', async () => {
    const update = vi.fn();
    const service = serviceWith({
      findOwned: vi.fn().mockResolvedValue(EXPENSE_IN_EXPENSE_CATEGORY),
      findOwnedCategory: vi.fn().mockResolvedValue(EXPENSE_CATEGORY),
      update,
    });

    // Đây là request đã đi lọt trước khi vá: không có `categoryId` nào trong body.
    await expect(
      service.update('user_1', 'tx_1', { type: 'income' }),
    ).rejects.toThrow(BadRequestException);

    expect(update).not.toHaveBeenCalled();
  });

  it('message nói được cả lý do lẫn hai cách thoát', async () => {
    const service = serviceWith({
      findOwned: vi.fn().mockResolvedValue(EXPENSE_IN_EXPENSE_CATEGORY),
      findOwnedCategory: vi.fn().mockResolvedValue(EXPENSE_CATEGORY),
      update: vi.fn(),
    });

    await expect(service.update('user_1', 'tx_1', { type: 'income' })).rejects.toThrow(
      /danh mục "Ăn uống".*danh mục chi.*danh mục thu mới.*chưa phân loại/s,
    );
  });

  it('đổi chiều KÈM danh mục mới đúng chiều thì cho qua', async () => {
    const update = vi.fn().mockResolvedValue(rowStub());
    const service = serviceWith({
      findOwned: vi.fn().mockResolvedValue(EXPENSE_IN_EXPENSE_CATEGORY),
      findOwnedCategory: vi.fn().mockResolvedValue(INCOME_CATEGORY),
      update,
    });

    await service.update('user_1', 'tx_1', { type: 'income', categoryId: INCOME_CATEGORY.id });

    expect(update).toHaveBeenCalled();
  });

  it('đổi chiều và bỏ danh mục về null thì cho qua', async () => {
    // Đường thoát mà message lỗi ở trên hứa hẹn — nó phải thật sự đi được.
    const update = vi.fn().mockResolvedValue(rowStub());
    const findOwnedCategory = vi.fn();
    const service = serviceWith({
      findOwned: vi.fn().mockResolvedValue(EXPENSE_IN_EXPENSE_CATEGORY),
      findOwnedCategory,
      update,
    });

    await service.update('user_1', 'tx_1', { type: 'income', categoryId: null });

    expect(update).toHaveBeenCalled();
    expect(findOwnedCategory).not.toHaveBeenCalled();
  });

  it('giao dịch chưa phân loại thì đổi chiều thoải mái', async () => {
    const update = vi.fn().mockResolvedValue(rowStub());
    const findOwnedCategory = vi.fn();
    const service = serviceWith({
      findOwned: vi.fn().mockResolvedValue({ id: 'tx_1', type: 'expense', categoryId: null }),
      findOwnedCategory,
      update,
    });

    await service.update('user_1', 'tx_1', { type: 'income' });

    expect(update).toHaveBeenCalled();
    expect(findOwnedCategory).not.toHaveBeenCalled();
  });

  it('sửa mô tả không kéo theo một query danh mục nào', async () => {
    // Chiều không đổi thì không có gì để kiểm. Nếu mất điều kiện này thì mỗi lần
    // sửa mô tả là thêm một round-trip cho câu trả lời luôn luôn "hợp lệ".
    const findOwnedCategory = vi.fn();
    const service = serviceWith({
      findOwned: vi.fn().mockResolvedValue(EXPENSE_IN_EXPENSE_CATEGORY),
      findOwnedCategory,
      update: vi.fn().mockResolvedValue(rowStub()),
    });

    await service.update('user_1', 'tx_1', { description: 'Cà phê sáng' });

    expect(findOwnedCategory).not.toHaveBeenCalled();
  });

  it('danh mục bị xoá song song thì không chặn — FK đã set null rồi', async () => {
    const update = vi.fn().mockResolvedValue(rowStub());
    const service = serviceWith({
      findOwned: vi.fn().mockResolvedValue(EXPENSE_IN_EXPENSE_CATEGORY),
      findOwnedCategory: vi.fn().mockResolvedValue(null),
      update,
    });

    await service.update('user_1', 'tx_1', { type: 'income' });

    expect(update).toHaveBeenCalled();
  });

  it('chọn thẳng danh mục lệch chiều vẫn là 404 như cũ', async () => {
    // Hành vi cũ, e2e đang khoá (transactions-flow.sh): người dùng CHỌN nhầm danh
    // mục thì 404, khác với 400 ở nhánh "đổi chiều làm hỏng danh mục đang giữ".
    const service = serviceWith({
      findOwned: vi.fn().mockResolvedValue(EXPENSE_IN_EXPENSE_CATEGORY),
      findOwnedCategory: vi.fn().mockResolvedValue(INCOME_CATEGORY),
      update: vi.fn(),
    });

    await expect(
      service.update('user_1', 'tx_1', { categoryId: INCOME_CATEGORY.id }),
    ).rejects.toThrow(NotFoundException);
  });
});

/** Row tối thiểu để `toTransactionDto` chạy được — nội dung không phải thứ đang test. */
function rowStub() {
  return {
    id: 'tx_1',
    amount: 25_000n,
    type: 'income' as const,
    date: new Date('2026-07-15T00:00:00.000Z'),
    description: 'Cà phê',
    balance: null,
    category: null,
    account: null,
    internalKind: null,
    importBatchId: null,
    createdAt: new Date('2026-07-15T10:00:00.000Z'),
  };
}
