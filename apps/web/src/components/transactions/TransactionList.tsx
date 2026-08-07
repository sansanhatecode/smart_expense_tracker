'use client';

import type { CategoryDto, InternalKind, TransactionDto } from '@expense/shared';
import { formatVnd } from '@expense/shared';
import { useMutation } from '@tanstack/react-query';
import { Shuffle, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useInvalidateTransactions } from '@/lib/queries';
import { cn, formatDate } from '@/lib/utils';
import { Badge, Button, CategoryIcon, Select } from '@/components/ui';

/** Nhãn của từng lý do "đây là tiền đổi chỗ, không phải chi tiêu". */
const INTERNAL_LABEL: Record<InternalKind, string> = {
  card_payment: 'Trả nợ thẻ',
  wallet_topup: 'Nạp ví',
  self_transfer: 'Chuyển nội bộ',
};

/**
 * Danh sách giao dịch của trang hiện tại.
 *
 * Hai thao tác sửa ngay tại dòng (đổi danh mục, bỏ đánh dấu nội bộ) nằm ở đây
 * chứ không ở trang: chúng chỉ chạm đúng dòng đang bấm và không cần biết gì về
 * bộ lọc hay lô đang chọn. Xoá thì ngược lại — nó đi qua hộp xác nhận của trang,
 * nên chỉ báo lên bằng `onDelete`.
 */
export function TransactionList({
  items,
  categories,
  selected,
  onToggle,
  onDelete,
  deleting,
}: {
  items: TransactionDto[];
  categories: CategoryDto[];
  selected: string[];
  onToggle: (id: string) => void;
  onDelete: (tx: TransactionDto) => void;
  /** Đang xoá một dòng nào đó — khoá nút xoá của cả danh sách. */
  deleting: boolean;
}) {
  const invalidate = useInvalidateTransactions();

  const recategorize = useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string | null }) =>
      api.patch<TransactionDto>(`/api/transactions/${id}`, { categoryId }),
    onSuccess: invalidate,
  });

  /**
   * Van an toàn cho nhận diện tự động. Ví dụ người dùng trả hộ thẻ của người
   * khác: mô tả giống hệt một khoản trả nợ thẻ, nhưng đó là chi tiêu thật và
   * chỉ họ mới biết. Bỏ đánh dấu đưa nó trở lại thống kê ngay.
   */
  const setInternal = useMutation({
    mutationFn: ({ id, internalKind }: { id: string; internalKind: InternalKind | null }) =>
      api.patch<TransactionDto>(`/api/transactions/${id}`, { internalKind }),
    onSuccess: invalidate,
  });

  return (
    <ul className="divide-y">
      {items.map((tx) => (
        <li
          key={tx.id}
          className={cn(
            'flex flex-wrap items-center gap-3 px-4 py-3 transition-colors duration-150 sm:px-5',
            // Dòng đang tick được tô nền: thanh hành động phía trên nói
            // "đã chọn 12", nhưng 12 dòng nào thì chỉ ô checkbox nhỏ xíu
            // ở đầu dòng trả lời được — quá ít cho một nút Xoá.
            selected.includes(tx.id) ? 'bg-accent-soft/40' : 'hover:bg-surface-hover',
          )}
        >
          <input
            type="checkbox"
            className="size-4 shrink-0"
            style={{ accentColor: 'var(--accent)' }}
            aria-label={`Chọn ${tx.description}`}
            checked={selected.includes(tx.id)}
            onChange={() => onToggle(tx.id)}
          />

          <CategoryIcon
            icon={tx.category?.icon ?? 'CircleHelp'}
            color={tx.category?.color ?? '#898781'}
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{tx.description}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <span className="tabular">{formatDate(tx.date)}</span>
              {tx.account && <span className="truncate">{tx.account.name}</span>}
              {tx.importBatchId && <Badge size="sm">từ import</Badge>}
              {/* Nói rõ dòng này KHÔNG nằm trong tổng thu chi, ngay tại
                  chỗ người dùng nhìn thấy số tiền của nó. */}
              {tx.internalKind && (
                <Badge size="sm">
                  <Shuffle aria-hidden className="size-3" />
                  {INTERNAL_LABEL[tx.internalKind]} · ngoài thống kê
                </Badge>
              )}
            </p>
          </div>

          {tx.internalKind && (
            <Button
              size="sm"
              disabled={setInternal.isPending}
              onClick={() => setInternal.mutate({ id: tx.id, internalKind: null })}
            >
              Tính lại
            </Button>
          )}

          {/* Đổi danh mục ngay tại dòng: sau import luôn còn một loạt
              giao dịch chưa phân loại, mở dialog cho từng cái là lý do
              người dùng bỏ giữa đường. */}
          <Select
            aria-label={`Danh mục của ${tx.description}`}
            value={tx.category?.id ?? ''}
            disabled={recategorize.isPending}
            onChange={(e) =>
              recategorize.mutate({
                id: tx.id,
                categoryId: e.target.value === '' ? null : e.target.value,
              })
            }
            className="h-8 w-full text-sm sm:w-44"
          >
            <option value="">Chưa phân loại</option>
            {categories
              .filter((category) => category.type === tx.type)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </Select>

          <span
            className="w-32 shrink-0 text-right text-sm font-medium tabular"
            style={{
              color: tx.type === 'income' ? 'var(--series-income)' : 'var(--ink)',
            }}
          >
            {tx.type === 'income' ? '+' : '−'}
            {formatVnd(tx.amount)}
          </span>

          <Button
            variant="danger"
            size="sm"
            aria-label={`Xoá ${tx.description}`}
            disabled={deleting}
            onClick={() => onDelete(tx)}
          >
            <Trash2 aria-hidden className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Điều hướng trang. Đứng ở chân Card, chỉ hiện khi có nhiều hơn một trang. */
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
      <p className="text-sm text-ink-muted">
        Trang {page} / {totalPages}
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Trước
        </Button>
        <Button size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Sau
        </Button>
      </div>
    </div>
  );
}
