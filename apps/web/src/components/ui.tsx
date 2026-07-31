'use client';

import * as Icons from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Primitive UI viết tay thay vì kéo cả một thư viện component.
 *
 * App này cần khoảng chục primitive, và mỗi cái là vài dòng — kéo về một thư
 * viện đầy đủ nghĩa là thêm dependency và một lớp API phải học, để dùng 10% của nó.
 * Tất cả style qua design token trong globals.css nên light/dark đổi ở một chỗ.
 */

// ─── Card ────────────────────────────────────────────────────────────────────

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border bg-surface', className)}
      style={{ borderRadius: 'var(--radius)' }}
      {...props}
    >
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

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:opacity-90',
  secondary: 'border bg-surface text-ink hover:bg-surface-raised',
  ghost: 'text-ink-secondary hover:bg-surface-raised hover:text-ink',
  danger: 'text-critical hover:bg-critical/10',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  loading,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-opacity',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
      style={{ borderRadius: 'var(--radius-sm)' }}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Icons.Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/**
 * Link mang hình dạng button.
 *
 * Tồn tại vì lồng `<Link>` trong `<Button>` sinh ra `<button><a>` — HTML không
 * hợp lệ, và screen reader lẫn bàn phím xử lý không đoán được. Điều hướng thì
 * phải là thẻ `<a>`; `<button>` để dành cho hành động.
 */
export function ButtonLink({
  href,
  variant = 'secondary',
  size = 'md',
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-opacity',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
      style={{ borderRadius: 'var(--radius-sm)' }}
    >
      {children}
    </Link>
  );
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-ink">{label}</span>
      {children}
      {/* Lỗi không bao giờ chỉ dựa vào màu viền: luôn có chữ mô tả cụ thể */}
      {error ? (
        <span className="flex items-start gap-1.5 text-sm text-critical">
          <Icons.CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </span>
      ) : (
        hint && <span className="block text-sm text-ink-muted">{hint}</span>
      )}
    </label>
  );
}

export function Input({
  className,
  invalid,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(
        'h-10 w-full border bg-surface px-3 text-sm text-ink placeholder:text-ink-muted',
        invalid && 'border-critical',
        className,
      )}
      style={{ borderRadius: 'var(--radius-sm)' }}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full appearance-none border bg-surface px-3 pr-8 text-sm text-ink',
        className,
      )}
      style={{
        borderRadius: 'var(--radius-sm)',
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23898781' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.5rem center',
        backgroundSize: '1rem',
      }}
      {...props}
    >
      {children}
    </select>
  );
}

// ─── Badge & status ──────────────────────────────────────────────────────────

/**
 * Trạng thái LUÔN có icon + chữ, không chỉ có màu.
 *
 * Ba màu status (warning, serious, critical) không đủ contrast trên nền sáng để
 * tự mang nghĩa, và người mù màu thì màu không nói gì cả. Icon + chữ là kênh
 * đáng tin, màu chỉ để nhận ra nhanh.
 */
export function StatusBadge({
  status,
  children,
}: {
  status: 'good' | 'warning' | 'critical' | 'neutral';
  children: React.ReactNode;
}) {
  const config = {
    good: { color: 'var(--status-good)', Icon: Icons.Check },
    warning: { color: 'var(--status-warning)', Icon: Icons.TriangleAlert },
    critical: { color: 'var(--status-critical)', Icon: Icons.CircleAlert },
    neutral: { color: 'var(--ink-muted)', Icon: Icons.Minus },
  }[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium"
      style={{ color: config.color }}
    >
      <config.Icon aria-hidden className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}

export function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-2 py-0.5 text-sm text-ink-secondary',
        className,
      )}
      style={{ borderRadius: '9999px' }}
    >
      {children}
    </span>
  );
}

// ─── Icon danh mục ───────────────────────────────────────────────────────────

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
      className={cn('inline-flex size-8 shrink-0 items-center justify-center', className)}
      style={{ backgroundColor: `${color}1f`, color, borderRadius: 'var(--radius-sm)' }}
    >
      <Icon className="size-4" />
    </span>
  );
}

// ─── Trạng thái rỗng / đang tải ──────────────────────────────────────────────

export function EmptyState({
  icon: Icon = Icons.Inbox,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <Icon className="size-8 text-ink-muted" />
      <div className="space-y-1">
        <p className="font-medium text-ink">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-ink-secondary">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse bg-surface-raised', className)}
      style={{ borderRadius: 'var(--radius-sm)' }}
    />
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Đã có lỗi xảy ra';

  return (
    <EmptyState
      icon={Icons.CircleAlert}
      title="Không tải được dữ liệu"
      description={message}
      action={
        onRetry && (
          <Button size="sm" onClick={onRetry}>
            Thử lại
          </Button>
        )
      }
    />
  );
}
