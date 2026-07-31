import { z } from 'zod';
import { monthSchema, vndAmountSchema } from '../common';
import type { CategoryDto } from './category';

export const upsertBudgetSchema = z.object({
  categoryId: z.string().min(1, 'Vui lòng chọn danh mục'),
  month: monthSchema,
  limitAmount: vndAmountSchema,
});

export type UpsertBudgetInput = z.infer<typeof upsertBudgetSchema>;

export const budgetQuerySchema = z.object({
  /** Bỏ trống thì API dùng tháng hiện tại theo giờ Việt Nam. */
  month: monthSchema.optional(),
});

export type BudgetQuery = z.infer<typeof budgetQuerySchema>;

export type BudgetStatus = 'ok' | 'warning' | 'over';

/** Ngưỡng cảnh báo "sắp vượt". Định nghĩa một chỗ để FE và BE không lệch nhau. */
export const BUDGET_WARNING_RATIO = 0.8;

export function budgetStatusOf(spent: number, limit: number): BudgetStatus {
  if (limit <= 0) return 'ok';
  if (spent > limit) return 'over';
  if (spent >= limit * BUDGET_WARNING_RATIO) return 'warning';
  return 'ok';
}

export interface BudgetDto {
  id: string;
  /** 'YYYY-MM' */
  month: string;
  limitAmount: number;
  /** Đã chi trong kỳ, tính từ DB bằng aggregation. */
  spent: number;
  /** Có thể âm khi đã vượt — cố tình không kẹp ở 0. */
  remaining: number;
  status: BudgetStatus;
  category: Pick<CategoryDto, 'id' | 'name' | 'type' | 'icon' | 'color'>;
}

/**
 * Dùng cho cảnh báo trên dashboard: chỉ những budget đang warning/over,
 * để không phải tải cả danh sách budget về rồi lọc ở FE.
 */
export interface BudgetAlertDto {
  budgetId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  month: string;
  limitAmount: number;
  spent: number;
  status: Exclude<BudgetStatus, 'ok'>;
}
