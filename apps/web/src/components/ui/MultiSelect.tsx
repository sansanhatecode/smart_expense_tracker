'use client';

import * as Icons from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * Chọn nhiều giá trị: một nút mở panel checkbox.
 *
 * Cố tình KHÔNG dùng `<select multiple>`: trên desktop nó đòi giữ Ctrl/Cmd để
 * chọn thêm — thao tác mà không có gì trên giao diện nói ra — và bấm thường vào
 * một dòng sẽ XOÁ hết lựa chọn cũ. Đó là cách nhanh nhất để người dùng mất bộ
 * lọc vừa dựng mà không hiểu vì sao.
 *
 * Bên trong panel là `<input type="checkbox">` thật, không phải div có
 * `role="checkbox"`: bàn phím, screen reader và trạng thái đã tick đều có sẵn
 * đúng, không phải dựng lại bằng tay.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  /** Chữ hiện trên nút khi chưa tick gì. */
  allLabel = 'Tất cả',
  className,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  allLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // `pointerdown` chứ không phải `click`: bấm vào một control khác phải đóng
    // panel NGAY, trước khi control đó xử lý cú bấm — nếu không thì panel còn mở
    // và che mất đúng thứ vừa bấm.
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const chosen = options.filter((option) => selected.includes(option.value));

  // Một lựa chọn thì hiện tên nó; nhiều thì hiện số đếm. Ghép 5 tên danh mục vào
  // một nút rộng 12rem chỉ ra một chuỗi bị cắt, không đọc được gì.
  const summary =
    chosen.length === 0
      ? allLabel
      : chosen.length === 1
        ? chosen[0]!.label
        : `${chosen.length} lựa chọn`;

  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-token-sm border bg-surface px-3 text-left text-sm transition-colors duration-150 hover:border-border-strong',
          // Panel đang mở thì nút giữ viền nhấn: nó và panel là một khối, và khi
          // panel che mất thứ bên dưới thì phải thấy được nó mọc ra từ đâu.
          open && 'border-accent',
          chosen.length === 0 ? 'text-ink-muted' : 'text-ink',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <Icons.ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 text-ink-muted transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="group"
          aria-label={label}
          className="scroll-slim absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-token-sm border bg-surface-raised p-1 shadow-overlay"
        >
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-token-sm px-2 py-1.5 text-sm text-ink transition-colors hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                className="size-4 shrink-0"
                style={{ accentColor: 'var(--accent)' }}
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
              />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </label>
          ))}

          {chosen.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full border-t px-2 py-1.5 text-left text-sm text-ink-secondary transition-colors hover:text-ink"
            >
              Bỏ chọn hết
            </button>
          )}
        </div>
      )}
    </div>
  );
}
