'use client';

import * as Icons from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Hover đổi MÀU chứ không đổi độ mờ.
 *
 * `opacity` từng là cách làm ở đây, và nó sai theo hai đường: nút mờ đi để lộ
 * nền phía sau nên ra màu khác nhau tuỳ chỗ đặt, và trên nền sáng thì nút nhạt
 * đi trông y hệt nút đang disabled — đúng tín hiệu ngược với thứ vừa hover.
 * `--accent-hover`/`--accent-active` là bậc màu thật, khai riêng cho từng mode.
 */
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink shadow-card hover:bg-accent-hover active:bg-accent-active',
  secondary: 'border bg-surface text-ink hover:border-border-strong hover:bg-surface-hover',
  ghost: 'text-ink-secondary hover:bg-surface-hover hover:text-ink',
  danger: 'text-critical hover:bg-critical/10 active:bg-critical/15',
};

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-token-sm font-medium transition-colors duration-150';

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
        BUTTON_BASE,
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
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
        BUTTON_BASE,
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
