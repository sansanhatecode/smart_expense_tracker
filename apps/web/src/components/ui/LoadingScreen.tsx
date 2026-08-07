'use client';

import * as Icons from 'lucide-react';

/**
 * Màn hình chờ chiếm cả khung nhìn — dùng cho lúc chưa biết đã đăng nhập hay chưa.
 *
 * Không dùng Skeleton ở đây: skeleton hứa hẹn nội dung sắp hiện ra đúng hình
 * dạng đó, mà lúc này còn chưa biết sẽ đi tới dashboard hay trang đăng nhập.
 */
export function LoadingScreen({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-dvh flex-col items-center justify-center gap-3 text-ink-muted"
    >
      <Icons.Loader2 aria-hidden className="size-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
