'use client';

import * as Icons from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { DIALOG_BASE } from './dialogStyles';

/**
 * Hộp thoại rỗng để nhét nội dung bất kỳ — form, thông tin, hướng dẫn.
 *
 * Tách khỏi `ConfirmDialog` chứ không gộp: hộp xác nhận khoá cứng hai nút và một
 * luồng "làm hay không", còn hộp này không biết bên trong có gì. Gộp lại thành
 * một component nhận chục prop tuỳ chọn thì cả hai chỗ dùng đều khó đọc hơn.
 *
 * Giống `ConfirmDialog`, dựng trên `<dialog>` gốc để có sẵn bắt focus, Escape,
 * chặn tương tác với phần dưới. KHÔNG đóng khi bấm ra ngoài: bên trong thường là
 * form đang gõ dở, và mất nó vì một cú bấm lệch là kiểu mất dữ liệu khó tha nhất.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape: chặn hành vi mặc định rồi báo lên state, nếu để `<dialog>` tự đóng
      // thì `open` vẫn true và lần sau không mở lại được.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={cn(DIALOG_BASE, 'max-w-lg')}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-ink-secondary">{description}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Đóng">
          <Icons.X aria-hidden className="size-4" />
        </Button>
      </div>

      <div className="mt-4">{children}</div>
    </dialog>
  );
}
