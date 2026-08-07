'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/components/ui';

/**
 * Chặn cửa cho mọi trang trong app.
 *
 * Đây là hàng rào UX, KHÔNG phải hàng rào bảo mật — dữ liệu được bảo vệ ở API,
 * nơi mọi query lọc theo userId và guard chặn request thiếu token. Nếu chỉ chặn ở
 * đây thì ai cũng lấy được dữ liệu bằng curl.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // Chờ biết chắc rồi mới vẽ: render nội dung khi chưa xác thực xong sẽ khiến các
  // query bắn đi kèm token rỗng và nhận 401 hàng loạt.
  if (loading || !user) return <LoadingScreen />;

  return <AppShell>{children}</AppShell>;
}
