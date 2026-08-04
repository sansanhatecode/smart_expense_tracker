import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ImportsService } from './imports.service';
import type { ImportsRepository } from './imports.repository';

/**
 * Quy tắc "danh mục phải cùng chiều với dòng", ở bước PREVIEW import.
 *
 * Bước này từng chỉ kiểm sở hữu danh mục, không kiểm chiều — và đó là đường vòng
 * qua toàn bộ quy tắc mà transactions.service canh rất kỹ: `confirm` copy dòng
 * staging vào `Transaction` bằng `createMany`, không đi qua transactions.service
 * một bước nào. UI đã lọc danh mục theo chiều rồi, nhưng UI không phải ranh giới.
 *
 * Repository là stub. Chỉ khai những method đường code đang test gọi tới — thiếu
 * cái nào là test nổ chứ không âm thầm đi nhánh khác.
 */
function serviceWith(stub: Partial<ImportsRepository>) {
  return new ImportsService(stub as ImportsRepository);
}

const PENDING_BATCH = { id: 'batch_1', status: 'pending' as const };
const INCOME_CATEGORY = { id: 'cat_luong', type: 'income' as const, name: 'Lương' };
const EXPENSE_CATEGORY = { id: 'cat_an_uong', type: 'expense' as const, name: 'Ăn uống' };

describe('updateRow — gán danh mục cho một dòng preview', () => {
  it('danh mục thu cho dòng chi thì chặn, và KHÔNG ghi gì', async () => {
    const updateStagedRow = vi.fn();
    const service = serviceWith({
      findOwnedBatch: vi.fn().mockResolvedValue(PENDING_BATCH),
      findStagedRow: vi.fn().mockResolvedValue({ id: 'row_1', type: 'expense' }),
      findOwnedCategory: vi.fn().mockResolvedValue(INCOME_CATEGORY),
      updateStagedRow,
    });

    await expect(
      service.updateRow('user_1', 'batch_1', 'row_1', { categoryId: INCOME_CATEGORY.id }),
    ).rejects.toThrow(NotFoundException);

    expect(updateStagedRow).not.toHaveBeenCalled();
  });

  it('cùng chiều thì gán được', async () => {
    const updateStagedRow = vi.fn().mockResolvedValue(stagedRowStub());
    const service = serviceWith({
      findOwnedBatch: vi.fn().mockResolvedValue(PENDING_BATCH),
      findStagedRow: vi.fn().mockResolvedValue({ id: 'row_1', type: 'expense' }),
      findOwnedCategory: vi.fn().mockResolvedValue(EXPENSE_CATEGORY),
      updateStagedRow,
    });

    await service.updateRow('user_1', 'batch_1', 'row_1', {
      categoryId: EXPENSE_CATEGORY.id,
    });

    expect(updateStagedRow).toHaveBeenCalled();
  });

  it('chỉ bỏ tick thì không cần danh mục nào', async () => {
    const findOwnedCategory = vi.fn();
    const service = serviceWith({
      findOwnedBatch: vi.fn().mockResolvedValue(PENDING_BATCH),
      findStagedRow: vi.fn().mockResolvedValue({ id: 'row_1', type: 'expense' }),
      findOwnedCategory,
      updateStagedRow: vi.fn().mockResolvedValue(stagedRowStub()),
    });

    await service.updateRow('user_1', 'batch_1', 'row_1', { selected: false });

    expect(findOwnedCategory).not.toHaveBeenCalled();
  });

  it('dòng không tồn tại thì báo dòng, không báo danh mục', async () => {
    // Thứ tự kiểm tra: tìm dòng trước rồi mới tới danh mục. Ngược lại thì người
    // dùng gửi rowId sai sẽ nhận "không tìm thấy danh mục" và đi sửa nhầm chỗ.
    const service = serviceWith({
      findOwnedBatch: vi.fn().mockResolvedValue(PENDING_BATCH),
      findStagedRow: vi.fn().mockResolvedValue(null),
      findOwnedCategory: vi.fn(),
      updateStagedRow: vi.fn(),
    });

    await expect(
      service.updateRow('user_1', 'batch_1', 'row_lạ', { categoryId: INCOME_CATEGORY.id }),
    ).rejects.toThrow(/Không tìm thấy dòng này trong batch/);
  });
});

describe('bulkUpdateRows — gán danh mục cho nhiều dòng preview', () => {
  it('lô có dòng lệch chiều thì chặn cả lô, và KHÔNG ghi gì', async () => {
    const updateStagedRows = vi.fn();
    const service = serviceWith({
      findOwnedBatch: vi.fn().mockResolvedValue(PENDING_BATCH),
      findOwnedCategory: vi.fn().mockResolvedValue(INCOME_CATEGORY),
      countMismatchedType: vi.fn().mockResolvedValue(3),
      updateStagedRows,
    });

    await expect(
      service.bulkUpdateRows('user_1', 'batch_1', {
        rowIds: ['row_1', 'row_2', 'row_3'],
        categoryId: INCOME_CATEGORY.id,
      }),
    ).rejects.toThrow(BadRequestException);

    // Chặn cả lô, không phải gán được bao nhiêu thì gán: `updated` nhỏ hơn số đã
    // chọn là thứ người dùng không nhìn thấy.
    expect(updateStagedRows).not.toHaveBeenCalled();
  });

  it('message nói rõ bao nhiêu dòng sai và sai theo chiều nào', async () => {
    const service = serviceWith({
      findOwnedBatch: vi.fn().mockResolvedValue(PENDING_BATCH),
      findOwnedCategory: vi.fn().mockResolvedValue(INCOME_CATEGORY),
      countMismatchedType: vi.fn().mockResolvedValue(3),
      updateStagedRows: vi.fn(),
    });

    await expect(
      service.bulkUpdateRows('user_1', 'batch_1', {
        rowIds: ['row_1'],
        categoryId: INCOME_CATEGORY.id,
      }),
    ).rejects.toThrow(/3 dòng đã chọn là giao dịch chi.*danh mục thu "Lương"/s);
  });

  it('lô cùng chiều thì gán được', async () => {
    const updateStagedRows = vi.fn().mockResolvedValue(2);
    const service = serviceWith({
      findOwnedBatch: vi.fn().mockResolvedValue(PENDING_BATCH),
      findOwnedCategory: vi.fn().mockResolvedValue(EXPENSE_CATEGORY),
      countMismatchedType: vi.fn().mockResolvedValue(0),
      updateStagedRows,
    });

    const result = await service.bulkUpdateRows('user_1', 'batch_1', {
      rowIds: ['row_1', 'row_2'],
      categoryId: EXPENSE_CATEGORY.id,
    });

    expect(result).toEqual({ updated: 2 });
  });

  it('bỏ danh mục (null) không cần kiểm chiều', async () => {
    const countMismatchedType = vi.fn();
    const service = serviceWith({
      findOwnedBatch: vi.fn().mockResolvedValue(PENDING_BATCH),
      findOwnedCategory: vi.fn(),
      countMismatchedType,
      updateStagedRows: vi.fn().mockResolvedValue(2),
    });

    await service.bulkUpdateRows('user_1', 'batch_1', {
      rowIds: ['row_1', 'row_2'],
      categoryId: null,
    });

    expect(countMismatchedType).not.toHaveBeenCalled();
  });

  it('danh mục của người khác thì 404, không phải 400', async () => {
    const service = serviceWith({
      findOwnedBatch: vi.fn().mockResolvedValue(PENDING_BATCH),
      findOwnedCategory: vi.fn().mockResolvedValue(null),
      updateStagedRows: vi.fn(),
    });

    await expect(
      service.bulkUpdateRows('user_1', 'batch_1', {
        rowIds: ['row_1'],
        categoryId: 'cat_cua_nguoi_khac',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

/** Row tối thiểu để `toStagedRowDto` chạy được. */
function stagedRowStub() {
  return {
    id: 'row_1',
    rowIndex: 0,
    amount: 25_000n,
    type: 'expense' as const,
    date: new Date('2026-07-15T00:00:00.000Z'),
    description: 'Cà phê',
    balance: null,
    duplicate: 'none' as const,
    selected: true,
    rawLine: '15/07/2026,25000,Cà phê',
    category: null,
  };
}
