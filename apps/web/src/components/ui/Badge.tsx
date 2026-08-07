'use client';

import { cn } from '@/lib/utils';

/**
 * Nhãn phụ trên một dòng danh sách ("từ import", "chưa phân loại").
 *
 * `size="sm"` là cỡ dùng khi badge đứng chung hàng với chữ meta của dòng: bằng
 * cỡ chữ đó thì nó tranh chỗ với mô tả giao dịch, mà mô tả mới là thứ cần đọc.
 */
export function Badge({
  size = 'md',
  className,
  children,
}: {
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-ink-secondary',
        size === 'sm' ? 'text-xs' : 'text-sm',
        className,
      )}
    >
      {children}
    </span>
  );
}
