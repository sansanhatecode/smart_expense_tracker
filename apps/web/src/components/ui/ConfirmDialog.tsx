'use client';

import * as Icons from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { DIALOG_BASE } from './dialogStyles';

/**
 * Xác nhận một hành động không hoàn lại được.
 *
 * Dựng trên `<dialog>` gốc chứ không phải div phủ lên: `showModal()` cho sẵn bắt
 * focus trong hộp, Escape để đóng, chặn tương tác với phần dưới, và cả `inert`
 * cho phần còn lại của trang. Tự làm bằng div nghĩa là tự viết lại đúng những
 * thứ đó — và thường là viết thiếu.
 *
 * Vì sao không dùng `confirm()` nữa: nó chỉ nhận được một chuỗi, nên không nói
 * được số tiền và ngày của dòng sắp xoá — mà đó chính là thứ người dùng cần để
 * biết mình có đang xoá đúng dòng không. Nó cũng khoá cứng cả tab trong lúc chờ
 * và không có chỗ nào để hiện lỗi nếu request thất bại.
 *
 * Hộp KHÔNG đóng khi đang chạy (`busy`) và không đóng khi bấm ra ngoài: hành
 * động phá huỷ thì đòi một lựa chọn rõ ràng, không đóng nhầm được.
 */
export function ConfirmDialog({
  open,
  title,
  /** Nội dung mô tả — đưa cả số tiền, ngày, số dòng vào đây. */
  children,
  confirmLabel,
  cancelLabel = 'Huỷ',
  busy = false,
  /** Lỗi của request vừa rồi. Hộp vẫn mở để người dùng thử lại. */
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // `open` là nguồn sự thật duy nhất; DOM chỉ đi theo. Có kiểm `dialog.open` vì
    // gọi `showModal()` khi đang mở sẽ ném lỗi.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape đi qua đây. Chặn hành vi mặc định rồi báo lên cho state đóng hộp:
      // để `<dialog>` tự đóng thì `open` vẫn là true và lần sau không mở lại được.
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className={cn(DIALOG_BASE, 'max-w-md')}
    >
      <div className="flex items-start gap-3">
        {/*
          Icon cảnh báo đứng cạnh tiêu đề: hộp này chỉ mở cho hành động phá huỷ,
          và tín hiệu đó phải đọc được trước cả khi đọc chữ. Màu một mình không
          làm được việc đó — nên là icon, và nó nằm trên nền dịu để không hét.
        */}
        <span className="flex size-9 shrink-0 items-center justify-center rounded-token-sm bg-critical/10">
          <Icons.TriangleAlert aria-hidden className="size-4.5 text-critical" />
        </span>
        <h2 id={titleId} className="mt-1.5 text-base font-semibold text-ink">
          {title}
        </h2>
      </div>

      {children && <div className="mt-3 space-y-1 text-sm text-ink-secondary">{children}</div>}

      {error && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-critical" role="alert">
          <Icons.CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        {/* Nút an toàn nhận focus đầu tiên: `showModal()` focus phần tử đầu có
            autofocus, và với hành động phá huỷ thì Enter theo phản xạ phải là Huỷ. */}
        <Button autoFocus disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="danger" loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
