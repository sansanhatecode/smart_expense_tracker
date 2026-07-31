import { z } from 'zod';
import { hexColorSchema, txTypeSchema, type TxType } from '../common';

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên danh mục').max(60),
  type: txTypeSchema,
  /** Tên icon trong lucide-react, ví dụ 'UtensilsCrossed'. */
  icon: z.string().trim().min(1).max(40).default('Tag'),
  color: hexColorSchema.default('#64748b'),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

export const updateCategorySchema = createCategorySchema.partial();

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

export const createCategoryRuleSchema = z.object({
  /** Sẽ được uppercase ở API; so khớp "contains" trên description đã normalize. */
  keyword: z.string().trim().min(2, 'Keyword cần ít nhất 2 ký tự').max(60),
  categoryId: z.string().min(1, 'Vui lòng chọn danh mục'),
  priority: z.number().int().min(0).max(1000).default(0),
});

export const updateCategoryRuleSchema = createCategoryRuleSchema.partial();

export type CreateCategoryRuleInput = z.infer<typeof createCategoryRuleSchema>;
export type UpdateCategoryRuleInput = z.infer<typeof updateCategoryRuleSchema>;

export interface CategoryRuleDto {
  id: string;
  keyword: string;
  priority: number;
  category: Pick<CategoryDto, 'id' | 'name' | 'type' | 'icon' | 'color'>;
}
