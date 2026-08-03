import { z } from 'zod';
import { vndBalanceSchema, type AccountKind } from '../common';

/**
 * Ngày trong tháng cho kỳ sao kê. Chặn ở 31 chứ không theo số ngày thật của
 * từng tháng — tháng 2 không có ngày 31 thì kỳ được kẹp về ngày cuối tháng lúc
 * hiển thị, chứ không phải là lỗi nhập liệu.
 */
export const dayOfMonthSchema = z
  .number()
  .int('Ngày phải là số nguyên')
  .min(1, 'Ngày phải từ 1 đến 31')
  .max(31, 'Ngày phải từ 1 đến 31');

/**
 * Chỉ cho sửa những gì người dùng thật sự biết. `kind` và `fingerprint` do
 * import suy ra và là thứ giữ cho lần import sau map đúng chỗ — đổi tay sẽ làm
 * lệch mọi thống kê đã tính, nên không mở ra.
 */
export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(1, 'Vui lòng nhập tên nguồn tiền').max(80),
    /** Dư nợ trước giao dịch sớm nhất đã import. Chỉ có nghĩa với thẻ tín dụng. */
    openingBalance: vndBalanceSchema,
    statementDay: dayOfMonthSchema.nullable(),
    dueDay: dayOfMonthSchema.nullable(),
  })
  .partial();

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export interface AccountDto {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalance: number;
  statementDay: number | null;
  dueDay: number | null;
  transactionCount: number;
  /**
   * Dư nợ hiện tại, CHỈ với `kind === 'credit_card'` (null với nguồn khác).
   * = openingBalance + tổng chi trên thẻ − tổng ghi có trên thẻ.
   * Dương = đang nợ. Âm = trả thừa.
   */
  outstanding: number | null;
  /**
   * Kỳ sao kê đang chạy, suy từ `statementDay`. null khi chưa khai báo ngày chốt.
   * `dueDate` suy từ `dueDay` của kỳ đó.
   */
  currentPeriod: { from: string; to: string; dueDate: string | null } | null;
  createdAt: string;
}
