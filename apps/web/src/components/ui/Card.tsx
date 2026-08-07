'use client';

import { cn } from '@/lib/utils';

/**
 * Nền của app (`--page`) và nền của card (`--surface`) chỉ cách nhau vài phần
 * trăm độ sáng, nên riêng viền không đủ tách card ra khỏi trang. Bóng đổ gánh
 * phần đó ở light mode; ở dark mode nó gần như vô hình và bậc bề mặt gánh thay
 * — cả hai đã khai sẵn theo mode trong globals.css.
 */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-token border bg-surface shadow-card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
