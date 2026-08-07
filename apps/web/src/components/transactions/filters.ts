import type { InternalFilter, TxType } from '@expense/shared';
import { expandInternalFilter } from '@expense/shared';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import type { MultiSelectOption } from '@/components/ui';
import { currentMonthRange } from '@/lib/utils';

export const PAGE_SIZE = 25;

/**
 * Giá trị đại diện mục "không có" trong danh sách tick được: "Chưa phân loại" ở
 * danh mục, "Không rõ nguồn" ở nguồn tiền.
 *
 * Cần một token riêng vì hai mục đó là `IS NULL` chứ không phải một id, nên
 * chúng đi lên API bằng tham số khác (`uncategorized`, `noAccount`). Chuỗi có
 * gạch dưới hai đầu để không đụng id thật.
 */
export const NONE = '__none__';

export interface Filters {
  /** Rỗng = không chặn đầu đó. */
  from: string;
  to: string;
  type: '' | TxType;
  /** Có thể chứa `NONE`. */
  categoryIds: string[];
  /** Có thể chứa `NONE`. */
  accountIds: string[];
  /** 'none' = khoản KHÔNG nội bộ, ba giá trị còn lại là từng lý do một. */
  internal: InternalFilter[];
  /** 'out' = chỉ khoản làm tiền rời khỏi nguồn. Loại trừ với `type`, xem `TYPE_OPTIONS`. */
  cashflow: '' | 'out';
  q: string;
  page: number;
}

/**
 * Ô "Loại" gộp cả chiều tiền và "tiền đã ra" vào một select.
 *
 * Ba lựa chọn đầu lọc theo cột `type`, còn "Tiền đã ra" là một định nghĩa khác
 * (bỏ khoản quẹt thẻ, giữ khoản trả sao kê) nên nó đi bằng tham số `cashflow`.
 * Gộp vì với người dùng cả bốn đều trả lời cùng một câu "cho tôi xem loại tiền
 * nào" — tách thành hai select cạnh nhau thì phải giải thích vì sao chọn cái
 * này lại phải bỏ cái kia.
 */
export const TYPE_OPTIONS = [
  { value: '', label: 'Tất cả', patch: { type: '', cashflow: '' } },
  { value: 'expense', label: 'Chi', patch: { type: 'expense', cashflow: '' } },
  { value: 'income', label: 'Thu', patch: { type: 'income', cashflow: '' } },
  { value: 'cash_out', label: 'Tiền đã ra', patch: { type: '', cashflow: 'out' } },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  patch: Pick<Filters, 'type' | 'cashflow'>;
}>;

/** Nhãn của từng mục ở ô "Khoản nội bộ", theo thứ tự hiện ra. */
export const INTERNAL_OPTIONS: MultiSelectOption[] = [
  { value: 'none', label: 'Không phải khoản nội bộ' },
  { value: 'card_payment', label: 'Trả nợ thẻ' },
  { value: 'wallet_topup', label: 'Nạp ví' },
  { value: 'self_transfer', label: 'Chuyển nội bộ' },
];

/** Danh sách tick → tham số id cho API, đã bỏ `NONE`. Rỗng → không gửi. */
function idsParam(values: string[]): string | undefined {
  const ids = values.filter((value) => value !== NONE);

  return ids.length > 0 ? ids.join(',') : undefined;
}

/**
 * Bộ lọc lúc mới vào trang, đọc từ URL.
 *
 * Các ô KPI của dashboard và trang Danh mục đều link sang đây kèm điều kiện, nên
 * URL là nguồn duy nhất của trạng thái ban đầu.
 */
export function initialFilters(searchParams: ReadonlyURLSearchParams): Filters {
  const month = currentMonthRange();
  const initialType = searchParams.get('type');

  /** `'a,b'` → `['a','b']`. Vắng mặt hoặc rỗng → `[]`. */
  const csv = (name: string) =>
    (searchParams.get(name) ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '');

  return {
    // Kỳ đến từ URL nếu có: dashboard link sang đây với đúng tháng đang xem, và
    // rơi về tháng hiện tại sẽ cho danh sách rỗng ngay sau khi vừa nói có N khoản.
    //
    // `?from=&to=` (có tham số nhưng để trống) là "không giới hạn kỳ" — trang
    // Danh mục dùng nó, vì số "N giao dịch" ở đó đếm từ đầu đến giờ chứ không
    // theo tháng. Chỉ khi tham số VẮNG MẶT mới rơi về tháng này.
    from: searchParams.get('from') ?? month.from,
    to: searchParams.get('to') ?? month.to,
    // Giá trị lạ trong URL rơi về "Tất cả" chứ không đi tiếp vào query: API
    // validate bằng zod nên `?type=abc` sẽ thành 400, và người dùng thấy màn
    // hình lỗi thay vì một danh sách.
    type: initialType === 'income' || initialType === 'expense' ? initialType : '',
    // "Chưa phân loại" / "Không rõ nguồn" đi lên API bằng tham số riêng, nhưng
    // trong state chúng là một phần tử của danh sách tick — người dùng thấy đúng
    // một danh sách, không phải một danh sách cộng một checkbox lẻ.
    categoryIds: [
      ...csv('categoryId'),
      ...(searchParams.get('uncategorized') === 'true' ? [NONE] : []),
    ],
    accountIds: [
      ...csv('accountId'),
      ...(searchParams.get('noAccount') === 'true' ? [NONE] : []),
    ],
    // Dịch `internal=exclude` của các link cũ về dạng chuẩn bằng đúng hàm mà API
    // dùng, nên hai bên không thể hiểu lệch nhau.
    internal: expandInternalFilter(csv('internal')),
    cashflow: searchParams.get('cashflow') === 'out' ? 'out' : '',
    q: '',
    page: 1,
  };
}

/** Bộ lọc trên màn hình → tham số của `GET /api/transactions`. */
export function transactionQuery(
  filters: Filters,
): Record<string, string | number | undefined> {
  return {
    // Ngày trống = không chặn đầu đó. Gửi chuỗi rỗng thì zod của API từ chối
    // (`dateOnlySchema` đòi đúng dạng YYYY-MM-DD) và cả trang thành màn hình
    // lỗi — tức xoá ô "Từ ngày" cũng đủ làm hỏng danh sách.
    from: filters.from || undefined,
    to: filters.to || undefined,
    type: filters.type || undefined,
    // Tách `NONE` ra khỏi danh sách id: nó là `IS NULL` nên đi bằng tham số
    // riêng. Gửi kèm cả hai nghĩa union — xem buildWhere.
    categoryId: idsParam(filters.categoryIds),
    uncategorized: filters.categoryIds.includes(NONE) ? 'true' : undefined,
    accountId: idsParam(filters.accountIds),
    noAccount: filters.accountIds.includes(NONE) ? 'true' : undefined,
    internal: filters.internal.length > 0 ? filters.internal.join(',') : undefined,
    cashflow: filters.cashflow || undefined,
    q: filters.q || undefined,
    page: filters.page,
    limit: PAGE_SIZE,
  };
}
