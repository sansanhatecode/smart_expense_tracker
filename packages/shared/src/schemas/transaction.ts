import { z } from 'zod';
import {
  dateOnlySchema,
  internalKindSchema,
  txTypeSchema,
  vndAmountSchema,
  vndBalanceSchema,
  type AccountKind,
  type InternalKind,
  type TxType,
} from '../common';
import type { CategoryDto } from './category';

/**
 * Field dùng chung cho create và update, KHÔNG mang `.default()`.
 *
 * Lý do phải tách ra: `.partial()` chỉ làm key thành optional, còn `ZodDefault`
 * bên trong vẫn chạy khi key vắng mặt. Nếu update = create.partial() thì
 * `PATCH {description}` sẽ trả về `{description, categoryId: null, balance: null}`
 * — tức mỗi lần sửa mô tả là âm thầm xoá danh mục của giao dịch. Đây là bug đã
 * xảy ra thật, phát hiện qua test.
 */
const transactionFields = {
  amount: vndAmountSchema,
  type: txTypeSchema,
  date: dateOnlySchema,
  description: z.string().trim().min(1, 'Vui lòng nhập mô tả').max(500),
  categoryId: z.string().min(1).nullable(),
  accountId: z.string().min(1).nullable(),
  balance: vndBalanceSchema.nullable(),
  /**
   * Sửa tay được, kể cả set về null. Đây là van an toàn cho nhận diện sai của
   * import — ví dụ người dùng trả hộ thẻ của người khác, đó là chi tiêu thật.
   */
  internalKind: internalKindSchema.nullable(),
};

export const createTransactionSchema = z.object({
  ...transactionFields,
  // Chỉ create mới có default: bỏ trống nghĩa là "chưa phân loại".
  categoryId: transactionFields.categoryId.default(null),
  // Bỏ trống = không rõ nguồn; thống kê coi như tài khoản tiền mặt.
  accountId: transactionFields.accountId.default(null),
  balance: transactionFields.balance.default(null),
  internalKind: transactionFields.internalKind.default(null),
});

/** Chỉ những field được gửi lên mới thay đổi. */
export const updateTransactionSchema = z.object(transactionFields).partial();

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const transactionSortSchema = z
  .enum(['date_desc', 'date_asc', 'amount_desc', 'amount_asc'])
  .default('date_desc');

export type TransactionSort = z.infer<typeof transactionSortSchema>;

/**
 * Query của danh sách giao dịch. Mọi field đều optional để URL sạch khi không
 * filter gì — và vì FE đồng bộ state filter vào query string.
 */
export const transactionQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    categoryId: z.string().min(1).optional(),
    /** 'none' = lọc riêng các giao dịch chưa gán danh mục. */
    uncategorized: z.stringbool().optional(),
    type: txTypeSchema.optional(),
    accountId: z.string().min(1).optional(),
    /**
     * Lọc theo khoản dịch chuyển nội bộ. Bỏ trống = trả về tất cả, vì danh sách
     * giao dịch là nơi người dùng xem dữ liệu thô, không phải nơi đọc thống kê.
     * `only` chính là màn hình "các khoản đã bị loại khỏi thống kê".
     */
    internal: z.enum(['only', 'exclude']).optional(),
    /**
     * `out` = chỉ những khoản làm tiền RỜI KHỎI nguồn có sẵn — cùng định nghĩa
     * với `cashOutflow` ở thống kê (xem stats.repository.ts). Tồn tại để ô
     * "Tiền đã ra" ở Tổng quan bấm được sang danh sách: không có nó thì không
     * tổ hợp filter nào cho ra đúng nhóm giao dịch đứng sau con số đó, và một
     * link ra danh sách lệch số còn tệ hơn không có link.
     */
    cashflow: z.enum(['out']).optional(),
    q: z.string().trim().min(1).max(200).optional(),
    importBatchId: z.string().min(1).optional(),
    sort: transactionSortSchema,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'Ngày bắt đầu phải trước ngày kết thúc',
    path: ['from'],
  });

export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

export interface TransactionDto {
  id: string;
  /** Số nguyên VND, luôn dương. Chiều nằm ở `type`. */
  amount: number;
  type: TxType;
  /** 'YYYY-MM-DD' */
  date: string;
  description: string;
  balance: number | null;
  category: Pick<CategoryDto, 'id' | 'name' | 'type' | 'icon' | 'color'> | null;
  /** null = giao dịch nhập tay không gắn nguồn tiền nào. */
  account: { id: string; name: string; kind: AccountKind } | null;
  /** Khác null = đã bị loại khỏi thống kê thu/chi. */
  internalKind: InternalKind | null;
  importBatchId: string | null;
  createdAt: string;
}

export const bulkCategorizeSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1).max(500),
  categoryId: z.string().min(1).nullable(),
});

export type BulkCategorizeInput = z.infer<typeof bulkCategorizeSchema>;
