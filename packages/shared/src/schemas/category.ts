import { z } from 'zod';
import { hexColorSchema, txTypeSchema, type TxType } from '../common';

/**
 * Field dùng chung, KHÔNG mang `.default()` — xem chú thích ở transaction.ts.
 * Nếu update = create.partial() thì đổi tên danh mục sẽ reset icon về 'Tag' và
 * màu về '#64748b', tức người dùng mất màu đã chọn mỗi lần sửa tên.
 */
const categoryFields = {
  name: z.string().trim().min(1, 'Vui lòng nhập tên danh mục').max(60),
  type: txTypeSchema,
  /** Tên icon trong lucide-react, ví dụ 'UtensilsCrossed'. */
  icon: z.string().trim().min(1).max(40),
  color: hexColorSchema,
  sortOrder: z.number().int().min(0).max(9999),
};

export const createCategorySchema = z.object({
  ...categoryFields,
  icon: categoryFields.icon.default('Tag'),
  color: categoryFields.color.default('#64748b'),
  sortOrder: categoryFields.sortOrder.default(0),
});

export const updateCategorySchema = z.object(categoryFields).partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export interface CategoryDto {
  id: string;
  name: string;
  type: TxType;
  icon: string;
  color: string;
  sortOrder: number;
  /** Số giao dịch đang dùng danh mục này — để cảnh báo trước khi xoá. */
  transactionCount?: number;
}

// ─── Rule auto-categorize ────────────────────────────────────────────────────

const categoryRuleFields = {
  /** Sẽ được uppercase ở API; so khớp "contains" trên description đã normalize. */
  keyword: z.string().trim().min(2, 'Keyword cần ít nhất 2 ký tự').max(60),
  categoryId: z.string().min(1, 'Vui lòng chọn danh mục'),
  priority: z.number().int().min(0).max(1000),
};

export const createCategoryRuleSchema = z.object({
  ...categoryRuleFields,
  priority: categoryRuleFields.priority.default(0),
});

export const updateCategoryRuleSchema = z.object(categoryRuleFields).partial();

export type CreateCategoryRuleInput = z.infer<typeof createCategoryRuleSchema>;
export type UpdateCategoryRuleInput = z.infer<typeof updateCategoryRuleSchema>;

export interface CategoryRuleDto {
  id: string;
  keyword: string;
  priority: number;
  category: Pick<CategoryDto, 'id' | 'name' | 'type' | 'icon' | 'color'>;
}
