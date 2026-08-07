'use client';

import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Icon của danh mục, tra theo tên lucide lưu trong DB.
 *
 * Đây là kênh identity chính của danh mục, cùng với tên — màu chỉ là phụ, vì
 * không thể có nhiều màu categorical phân biệt được (xem default-categories.ts).
 */
export function CategoryIcon({
  icon,
  color,
  className,
}: {
  icon: string;
  color: string;
  className?: string;
}) {
  const Lookup = Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  const Icon = Lookup[icon] ?? Icons.Tag;

  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-token-sm',
        className,
      )}
      // Nền là chính màu danh mục ở 12% — không phải một màu xám cố định: ở 12%
      // nó vẫn đủ nhạt để icon đọc được ở cả hai mode, mà vẫn nhắc lại được màu.
      style={{ backgroundColor: `${color}1f`, color }}
    >
      <Icon className="size-4" />
    </span>
  );
}
