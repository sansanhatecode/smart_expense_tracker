'use client';

import { ChartPie } from 'lucide-react';
import { Card } from './ui';
import { ThemeToggle } from './theme-toggle';

/**
 * Khung chung cho hai trang đăng nhập / đăng ký.
 *
 * Gom lại vì hai trang đó là cùng một màn hình với nội dung khác nhau, và trước
 * đây chúng chép nhau từng class một — đủ để lệch nhau lúc sửa một bên.
 *
 * Nút đổi theme có mặt ở đây chứ không chỉ trong app: người vào bằng máy để
 * light mode giữa đêm gặp ngay một trang trắng, và lúc đó họ chưa đăng nhập
 * được để tìm nút trong sidebar.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /** Dòng chuyển sang trang còn lại, cộng ghi chú riêng của từng trang. */
  footer?: React.ReactNode;
}) {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <ThemeToggle className="absolute right-6 top-6 w-28" />

      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-11 items-center justify-center rounded-token bg-accent-soft">
          <ChartPie aria-hidden className="size-5.5 text-accent" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>
        </div>
      </div>

      {/* Bóng đậm hơn card thường: đây là thứ duy nhất trên trang, nên nó được
          phép nổi hẳn lên thay vì chỉ tách nhẹ khỏi nền. */}
      <Card className="p-5 shadow-pop">{children}</Card>

      {footer && <div className="space-y-3 text-center">{footer}</div>}
    </main>
  );
}
