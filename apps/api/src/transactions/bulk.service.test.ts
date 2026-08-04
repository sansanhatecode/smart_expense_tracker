import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';

/**
 * Thao tác trên nhiều giao dịch: gán danh mục cả lô, xoá cả lô.
 *
 * Repository là stub thay vì DB thật: phần đáng test ở đây là quy tắc nghiệp vụ
 * (lô lệch chiều thu/chi thì chặn, và chặn TRƯỚC khi ghi), còn câu SQL thì đã có
 * e2e lo. Chỉ khai những method mà đường code đang test gọi tới — thiếu cái nào
 * là test sẽ nổ chứ không âm thầm đi nhánh khác.
 */
function serviceWith(stub: Partial<TransactionsRepository>) {
  return new TransactionsService(stub as TransactionsRepository);
}

const INCOME_CATEGORY = { id: 'cat_income', type: 'income' as const, name: 'Lương' };

describe('bulkCategorize', () => {
  it('lô cùng chiều với danh mục thì gán được', async () => {
    const setCategoryMany = vi.fn().mockResolvedValue(3);
    const service = serviceWith({
      findOwnedCategory: vi.fn().mockResolvedValue(INCOME_CATEGORY),
      countMismatchedType: vi.fn().mockResolvedValue(0),
      setCategoryMany,
    });

    const result = await service.bulkCategorize('user_1', {
      transactionIds: ['tx_1', 'tx_2', 'tx_3'],
      categoryId: 'cat_income',
    });

    expect(result).toEqual({ updated: 3 });
    expect(setCategoryMany).toHaveBeenCalledWith('user_1', ['tx_1', 'tx_2', 'tx_3'], 'cat_income');
  });

  it('lô có giao dịch lệch chiều thì chặn, và KHÔNG ghi gì', async () => {
    const setCategoryMany = vi.fn();
    const service = serviceWith({
      findOwnedCategory: vi.fn().mockResolvedValue(INCOME_CATEGORY),
      countMismatchedType: vi.fn().mockResolvedValue(2),
      setCategoryMany,
    });

    await expect(
      service.bulkCategorize('user_1', {
        transactionIds: ['tx_1', 'tx_2', 'tx_3'],
        categoryId: 'cat_income',
      }),
    ).rejects.toThrow(BadRequestException);

    // Điểm quan trọng của test này: chặn cả lô, không phải gán được bao nhiêu thì
    // gán. Gán một phần là thứ người dùng không nhìn thấy.
    expect(setCategoryMany).not.toHaveBeenCalled();
  });

  it('message lỗi nói rõ bao nhiêu dòng sai và sai theo chiều nào', async () => {
    const service = serviceWith({
      findOwnedCategory: vi.fn().mockResolvedValue(INCOME_CATEGORY),
      countMismatchedType: vi.fn().mockResolvedValue(2),
      setCategoryMany: vi.fn(),
    });

    await expect(
      service.bulkCategorize('user_1', { transactionIds: ['tx_1'], categoryId: 'cat_income' }),
    ).rejects.toThrow(/2 giao dịch đã chọn là giao dịch chi.*danh mục thu "Lương"/s);
  });

  it('bỏ danh mục (categoryId null) không cần kiểm chiều', async () => {
    // Về "chưa phân loại" thì không có chiều nào để lệch, nên không được đòi hỏi
    // lô phải cùng chiều — đây là đường thoát khi người dùng gán sai.
    const findOwnedCategory = vi.fn();
    const setCategoryMany = vi.fn().mockResolvedValue(2);
    const service = serviceWith({ findOwnedCategory, setCategoryMany });

    const result = await service.bulkCategorize('user_1', {
      transactionIds: ['tx_1', 'tx_2'],
      categoryId: null,
    });

    expect(result).toEqual({ updated: 2 });
    expect(findOwnedCategory).not.toHaveBeenCalled();
  });

  it('danh mục của người khác thì 404, không phải 400', async () => {
    const service = serviceWith({
      findOwnedCategory: vi.fn().mockResolvedValue(null),
      setCategoryMany: vi.fn(),
    });

    await expect(
      service.bulkCategorize('user_1', { transactionIds: ['tx_1'], categoryId: 'cat_cua_nguoi_khac' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('bulkDelete', () => {
  it('trả về số dòng thật sự bị xoá', async () => {
    const deleteMany = vi.fn().mockResolvedValue(2);
    const service = serviceWith({ deleteMany });

    // Ba id nhưng chỉ hai dòng bị xoá: id thứ ba không thuộc user này. `userId`
    // trong where của deleteMany là thứ chặn, nên service không cần kiểm trước.
    const result = await service.bulkDelete('user_1', {
      transactionIds: ['tx_1', 'tx_2', 'tx_cua_nguoi_khac'],
    });

    expect(result).toEqual({ deleted: 2 });
    expect(deleteMany).toHaveBeenCalledWith('user_1', [
      'tx_1',
      'tx_2',
      'tx_cua_nguoi_khac',
    ]);
  });
});
