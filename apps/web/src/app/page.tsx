'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';

/**
 * Trang gốc chỉ điều hướng.
 *
 * Phải chờ `loading` xong mới quyết định: access token nằm trong memory nên ngay
 * sau khi reload thì chưa biết đã đăng nhập hay chưa. Điều hướng sớm sẽ đẩy người
 * đang đăng nhập về trang login rồi lại nhảy về dashboard — một cú nhấp nháy vô cớ.
 */
export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/dashboard' : '/login');
  }, [user, loading, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="text-sm text-ink-muted">Đang tải…</p>
    </div>
  );
}
