import { z } from 'zod';
import { MAX_TRANSACTION_VND } from './money';

/**
 * Số tiền VND qua dây: số nguyên, dương, và có trần trùng với CHECK constraint
 * trong DB (`Transaction_amount_max`). Hai chỗ phải khớp nhau — nếu đổi thì đổi
 * cả migration.
 */
export const vndAmountSchema = z
  .number()
  .int('Số tiền phải là số nguyên đồng')
  .positive('Số tiền phải lớn hơn 0')
  .max(MAX_TRANSACTION_VND, 'Số tiền vượt mức cho phép');

/** Số dư có thể âm (tài khoản âm) nên không dùng vndAmountSchema. */
export const vndBalanceSchema = z
  .number()
  .int('Số dư phải là số nguyên đồng')
  .min(-MAX_TRANSACTION_VND)
  .max(MAX_TRANSACTION_VND);

/** Chiều của giao dịch. `amount` luôn dương, chiều nằm ở đây. Xem ADR 9.4. */
export const txTypeSchema = z.enum(['income', 'expense']);
export type TxType = z.infer<typeof txTypeSchema>;

/** Loại nguồn tiền. Xem docblock enum `AccountKind` trong schema.prisma. */
export const accountKindSchema = z.enum(['bank', 'credit_card', 'wallet']);
export type AccountKind = z.infer<typeof accountKindSchema>;

/**
 * Vì sao một giao dịch là tiền dịch chuyển nội bộ chứ không phải chi tiêu/thu
 * nhập thật. `null` = giao dịch thật. Độc lập với `txType`: một khoản trả nợ
 * thẻ vừa có chiều (ra khỏi tài khoản, vào thẻ) vừa là nội bộ.
 */
export const internalKindSchema = z.enum(['card_payment', 'wallet_topup', 'self_transfer']);
export type InternalKind = z.infer<typeof internalKindSchema>;

export const importSourceSchema = z.enum(['csv', 'xlsx', 'pdf']);
export type ImportSource = z.infer<typeof importSourceSchema>;

export const importStatusSchema = z.enum(['pending', 'confirmed', 'rolled_back']);
export type ImportStatus = z.infer<typeof importStatusSchema>;

/**
 * Ngày giao dịch đi qua dây dưới dạng 'YYYY-MM-DD'.
 *
 * Cố tình KHÔNG dùng ISO datetime: cột DB là `DATE` (ngày lịch, không phải
 * instant) nên nếu truyền datetime thì lại mở lại đúng lớp bug timezone mà
 * ADR 9.5 đã đóng.
 */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
      date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    );
  }, 'Ngày không tồn tại');

/** Kỳ ngân sách: 'YYYY-MM'. */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Kỳ phải có dạng YYYY-MM');

export const cuidSchema = z.string().min(1, 'Thiếu id');

/** Mã màu hex 6 ký tự cho danh mục — dùng trực tiếp làm màu chart. */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Màu phải có dạng #RRGGBB');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Shape lỗi thống nhất mà API luôn trả về, để FE có một chỗ xử lý duy nhất. */
export interface ApiErrorBody {
  statusCode: number;
  message: string;
  /** Lỗi theo từng field, khi validation thất bại. */
  fieldErrors?: Record<string, string[]>;
}
