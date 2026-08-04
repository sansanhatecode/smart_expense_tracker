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
 * Danh sách nhiều giá trị trong query string: `'a,b,c'` → `['a', 'b', 'c']`.
 *
 * Chọn dạng ngăn bằng phẩy chứ KHÔNG phải tham số lặp (`categoryId=a&categoryId=b`)
 * vì một giá trị đơn vẫn là cú pháp hợp lệ của nó: mọi link đã có
 * (`?categoryId=<id>` từ trang Danh mục, `?accountId=<id>` từ dashboard) chạy tiếp
 * không cần sửa. Tham số lặp thì Express trả ra `string[]`, và mọi chỗ đọc query
 * phải nhớ giá trị có thể là chuỗi HOẶC mảng — sai một chỗ là một filter im lặng
 * không có tác dụng.
 *
 * Danh sách rỗng (`?categoryId=`) được chấp nhận và có nghĩa "không lọc", không
 * phải lỗi 400: FE xoá hết tick thì URL trông đúng như vậy.
 */
function csvList<T extends z.ZodType<string, string>>(item: T) {
  return z
    .string()
    .transform((raw) =>
      raw
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== ''),
    )
    .pipe(z.array(item));
}

/** Ba lý do một khoản là tiền đổi chỗ, cộng `none` = "không phải khoản nội bộ". */
export const INTERNAL_FILTER_VALUES = [
  'none',
  'card_payment',
  'wallet_topup',
  'self_transfer',
] as const;

export type InternalFilter = (typeof INTERNAL_FILTER_VALUES)[number];

/**
 * Dịch `only`/`exclude` — cách viết cũ, thô — về dạng chuẩn.
 *
 * `exclude` = chỉ khoản không nội bộ; `only` = cả ba loại nội bộ. Giữ lại vì các
 * link đã có dùng chúng (`?internal=exclude` từ mọi ô KPI ở Tổng quan), và vì
 * `internal=exclude` viết tay vẫn ngắn hơn liệt kê. Dịch NGAY ở tầng schema để
 * chỉ có một vocabulary đi tiếp vào where clause và vào state của FE.
 */
export function expandInternalFilter(values: readonly string[]): InternalFilter[] {
  const expanded = values.flatMap((value): InternalFilter[] => {
    if (value === 'only') return ['card_payment', 'wallet_topup', 'self_transfer'];
    if (value === 'exclude') return ['none'];
    return INTERNAL_FILTER_VALUES.includes(value as InternalFilter)
      ? [value as InternalFilter]
      : [];
  });

  return [...new Set(expanded)];
}

/**
 * Query của danh sách giao dịch. Mọi field đều optional để URL sạch khi không
 * filter gì — và vì FE đồng bộ state filter vào query string.
 *
 * Danh mục, nguồn tiền và khoản nội bộ nhận NHIỀU giá trị: người dùng tick được
 * "Ăn uống + Cà phê", và câu hỏi "tháng này tiêu bao nhiêu cho ăn uống nói
 * chung" cần đúng khả năng đó.
 */
export const transactionQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    categoryId: csvList(z.string().min(1)).optional(),
    /**
     * Giao dịch chưa gán danh mục. Tham số riêng chứ không phải một phần tử của
     * `categoryId` vì "chưa phân loại" là `IS NULL`, không phải một id.
     *
     * Cộng DỒN với `categoryId` (union), không còn đè lên nó như trước: tick
     * "Ăn uống + Chưa phân loại" là một câu hỏi hợp lý, và đè thì một trong hai
     * tick sẽ im lặng không có tác dụng.
     */
    uncategorized: z.stringbool().optional(),
    type: txTypeSchema.optional(),
    accountId: csvList(z.string().min(1)).optional(),
    /** Giao dịch không gắn nguồn tiền (nhập tay). Cùng lý lẽ với `uncategorized`. */
    noAccount: z.stringbool().optional(),
    /**
     * Lọc theo khoản dịch chuyển nội bộ. Bỏ trống = trả về tất cả, vì danh sách
     * giao dịch là nơi người dùng xem dữ liệu thô, không phải nơi đọc thống kê.
     *
     * Nhận cả `only`/`exclude` cũ lẫn từng loại một, tất cả về dạng chuẩn qua
     * `expandInternalFilter`. Nhờ đó "chỉ xem khoản trả nợ thẻ" lọc được, thay vì
     * chỉ có nguyên cục "mọi khoản nội bộ".
     */
    internal: csvList(z.enum([...INTERNAL_FILTER_VALUES, 'only', 'exclude']))
      .transform(expandInternalFilter)
      .optional(),
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
