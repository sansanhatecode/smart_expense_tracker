import { describe, expect, it } from 'vitest';
import {
  createCategoryRuleSchema,
  createCategorySchema,
  updateCategoryRuleSchema,
  updateCategorySchema,
} from './category';
import { createTransactionSchema, updateTransactionSchema } from './transaction';

/**
 * Hồi quy cho một bug đã xảy ra thật.
 *
 * `updateX = createX.partial()` trông đúng nhưng không phải: `.partial()` chỉ
 * làm key thành optional, còn `ZodDefault` bên trong vẫn chạy khi key vắng mặt.
 * Hệ quả là mọi PATCH đều ghi giá trị default lên những field người dùng KHÔNG
 * gửi lên — tức sửa mô tả giao dịch thì mất danh mục, đổi tên danh mục thì mất
 * màu đã chọn. Mất dữ liệu, và im lặng.
 *
 * Luật: schema update phải chỉ chứa đúng những field được gửi lên.
 */
describe('schema update không được tự thêm field', () => {
  it('sửa mô tả giao dịch không được xoá categoryId/balance', () => {
    const parsed = updateTransactionSchema.parse({ description: 'Ca phe sang' });
    expect(Object.keys(parsed)).toEqual(['description']);
    expect(parsed).not.toHaveProperty('categoryId');
    expect(parsed).not.toHaveProperty('balance');
  });

  it('đổi tên danh mục không được reset icon/color/sortOrder', () => {
    const parsed = updateCategorySchema.parse({ name: 'Cà phê' });
    expect(Object.keys(parsed)).toEqual(['name']);
  });

  it('sửa keyword không được reset priority', () => {
    const parsed = updateCategoryRuleSchema.parse({ keyword: 'ABC' });
    expect(Object.keys(parsed)).toEqual(['keyword']);
  });

  it('gửi null tường minh thì VẪN phải xoá — khác với không gửi gì', () => {
    // Đây là chỗ phân biệt "không đổi" với "xoá danh mục": null là ý định rõ ràng.
    const parsed = updateTransactionSchema.parse({ categoryId: null });
    expect(parsed).toHaveProperty('categoryId', null);
  });

  it('update rỗng thì ra object rỗng, không ra một loạt default', () => {
    expect(updateTransactionSchema.parse({})).toEqual({});
    expect(updateCategorySchema.parse({})).toEqual({});
    expect(updateCategoryRuleSchema.parse({})).toEqual({});
  });
});

describe('schema create vẫn giữ default', () => {
  it('giao dịch không chọn danh mục → categoryId null, balance null', () => {
    const parsed = createTransactionSchema.parse({
      amount: 50_000,
      type: 'expense',
      date: '2026-07-15',
      description: 'Ca phe',
    });
    expect(parsed.categoryId).toBeNull();
    expect(parsed.balance).toBeNull();
  });

  it('danh mục mới có icon/color/sortOrder mặc định', () => {
    const parsed = createCategorySchema.parse({ name: 'Cà phê', type: 'expense' });
    expect(parsed.icon).toBe('Tag');
    expect(parsed.color).toBe('#64748b');
    expect(parsed.sortOrder).toBe(0);
  });

  it('rule mới có priority mặc định 0', () => {
    const parsed = createCategoryRuleSchema.parse({ keyword: 'GRAB', categoryId: 'c1' });
    expect(parsed.priority).toBe(0);
  });

  it('create vẫn bắt buộc các field không có default', () => {
    expect(createTransactionSchema.safeParse({ amount: 1000 }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: 'X' }).success).toBe(false);
  });
});
