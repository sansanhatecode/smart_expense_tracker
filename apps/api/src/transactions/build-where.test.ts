import { transactionQuerySchema } from '@expense/shared';
import { describe, expect, it } from 'vitest';
import { buildWhere } from './transactions.repository';

/**
 * Where clause của danh sách giao dịch.
 *
 * Đi qua zod thay vì tự dựng object `TransactionQuery`: query thật luôn là chuỗi
 * từ URL, và phần lớn cái đáng sai nằm ở chỗ chuỗi biến thành mảng — tự dựng
 * object là test một đường mà thực tế không đi qua.
 */
function whereOf(query: Record<string, string>) {
  return buildWhere('user_1', transactionQuerySchema.parse(query));
}

describe('buildWhere — danh mục', () => {
  it('một id: điều kiện phẳng, không cần OR', () => {
    expect(whereOf({ categoryId: 'cat_a' })).toMatchObject({
      categoryId: { in: ['cat_a'] },
    });
  });

  it('nhiều id', () => {
    expect(whereOf({ categoryId: 'cat_a,cat_b' })).toMatchObject({
      categoryId: { in: ['cat_a', 'cat_b'] },
    });
  });

  it('chỉ chưa phân loại', () => {
    expect(whereOf({ uncategorized: 'true' })).toMatchObject({ categoryId: null });
  });

  it('id CỘNG chưa phân loại là union, không phải cái nọ đè cái kia', () => {
    // Đây là hành vi đã đổi: trước kia `uncategorized` thắng và `categoryId` bị
    // bỏ im lặng. Với filter tick nhiều thì cả hai tick phải có tác dụng.
    const where = whereOf({ categoryId: 'cat_a', uncategorized: 'true' });

    expect(where.categoryId).toBeUndefined();
    expect(where.AND).toEqual([
      { OR: [{ categoryId: null }, { categoryId: { in: ['cat_a'] } }] },
    ]);
  });
});

describe('buildWhere — nguồn tiền', () => {
  it('nhiều nguồn', () => {
    expect(whereOf({ accountId: 'acc_1,acc_2' })).toMatchObject({
      accountId: { in: ['acc_1', 'acc_2'] },
    });
  });

  it('nguồn cộng "không rõ nguồn"', () => {
    expect(whereOf({ accountId: 'acc_1', noAccount: 'true' }).AND).toEqual([
      { OR: [{ accountId: null }, { accountId: { in: ['acc_1'] } }] },
    ]);
  });
});

describe('buildWhere — khoản nội bộ', () => {
  it('link cũ internal=exclude vẫn là "chỉ khoản không nội bộ"', () => {
    expect(whereOf({ internal: 'exclude' })).toMatchObject({ internalKind: null });
  });

  it('link cũ internal=only vẫn là "mọi khoản nội bộ"', () => {
    expect(whereOf({ internal: 'only' })).toMatchObject({
      internalKind: { in: ['card_payment', 'wallet_topup', 'self_transfer'] },
    });
  });

  it('lọc được đúng một loại', () => {
    expect(whereOf({ internal: 'card_payment' })).toMatchObject({
      internalKind: { in: ['card_payment'] },
    });
  });

  it('một loại cộng "không nội bộ" thành OR', () => {
    expect(whereOf({ internal: 'card_payment,none' }).AND).toEqual([
      { OR: [{ internalKind: null }, { internalKind: { in: ['card_payment'] } }] },
    ]);
  });

  it('không truyền gì thì không lọc theo internalKind', () => {
    expect(whereOf({}).internalKind).toBeUndefined();
  });
});

describe('buildWhere — cashflow=out', () => {
  it('đè type và thêm hai điều kiện của "tiền đã ra"', () => {
    const where = whereOf({ cashflow: 'out', type: 'income' });

    expect(where.type).toBe('expense');
    expect(where.AND).toEqual([
      { OR: [{ accountId: null }, { account: { kind: { not: 'credit_card' } } }] },
      { OR: [{ internalKind: null }, { internalKind: 'card_payment' }] },
    ]);
  });

  it('giao được với filter khoản nội bộ của người dùng, không đè nhau', () => {
    // Tiền đã ra + chỉ trả nợ thẻ = đúng các khoản thanh toán sao kê.
    const where = whereOf({ cashflow: 'out', internal: 'card_payment' });

    expect(where.internalKind).toEqual({ in: ['card_payment'] });
    expect(where.AND).toHaveLength(2);
  });

  it('nhóm OR của mọi filter cùng tồn tại, không nhóm nào bị ghi đè', () => {
    const where = whereOf({
      cashflow: 'out',
      categoryId: 'cat_a',
      uncategorized: 'true',
      accountId: 'acc_1',
      noAccount: 'true',
      internal: 'card_payment,none',
    });

    // 3 nhóm của filter tick nhiều + 2 nhóm của cashflow.
    expect(where.AND).toHaveLength(5);
  });
});

describe('buildWhere — phần không đổi', () => {
  it('userId luôn có mặt', () => {
    expect(whereOf({}).userId).toBe('user_1');
  });

  it('`to` là ngày bao gồm (lte), không phải lt', () => {
    const where = whereOf({ from: '2026-08-01', to: '2026-08-31' });

    expect(where.date).toEqual({
      gte: new Date('2026-08-01T00:00:00.000Z'),
      lte: new Date('2026-08-31T00:00:00.000Z'),
    });
  });

  it('tìm mô tả không phân biệt hoa thường', () => {
    expect(whereOf({ q: 'grab' })).toMatchObject({
      description: { contains: 'grab', mode: 'insensitive' },
    });
  });
});
