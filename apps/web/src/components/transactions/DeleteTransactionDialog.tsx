'use client';

import type { TransactionDto } from '@expense/shared';
import { formatVnd } from '@expense/shared';
import { ConfirmDialog } from '@/components/ui';
import { formatDate } from '@/lib/utils';

/**
 * Thứ đang chờ xác nhận xoá.
 *
 * Giữ cả object giao dịch chứ không chỉ id: hộp xác nhận hiện mô tả, số tiền và
 * ngày của dòng đó — đó là thứ để người dùng biết mình có đang xoá đúng dòng
 * không, và là điều `confirm()` với một chuỗi không làm được.
 */
export type DeleteTarget = { kind: 'one'; tx: TransactionDto } | { kind: 'bulk'; count: number };

/**
 * Một hộp cho cả hai đường xoá, không phải một hộp cho mỗi dòng: nội dung khác
 * nhau nhưng luôn chỉ có tối đa MỘT câu hỏi đang chờ trả lời, và `target` chính
 * là câu hỏi đó. `null` = hộp đang đóng.
 */
export function DeleteTransactionDialog({
  target,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  target: DeleteTarget | null;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={target !== null}
      title={target?.kind === 'bulk' ? `Xoá ${target.count} giao dịch?` : 'Xoá giao dịch này?'}
      confirmLabel={
        target?.kind === 'bulk' ? `Xoá ${target.count} giao dịch` : 'Xoá giao dịch'
      }
      busy={busy}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      {target?.kind === 'one' && (
        <>
          {/* Mô tả, số tiền và ngày: đủ để nhận ra có đúng dòng mình định xoá
              không. Danh sách có thể có nhiều dòng mô tả giống nhau. */}
          <p className="font-medium text-ink">{target.tx.description}</p>
          <p className="tabular">
            {target.tx.type === 'income' ? '+' : '−'}
            {formatVnd(target.tx.amount)} · {formatDate(target.tx.date)}
            {target.tx.account ? ` · ${target.tx.account.name}` : ''}
          </p>
        </>
      )}
      <p>
        {target?.kind === 'bulk' ? 'Toàn bộ các giao dịch đang tick sẽ bị xoá. ' : ''}
        Không hoàn lại được. Thống kê và ngân sách sẽ tính lại theo dữ liệu còn lại.
      </p>
    </ConfirmDialog>
  );
}
