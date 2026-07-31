'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('demo12345');
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Đã đăng nhập rồi thì không có lý do ở lại trang login
  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login({ email, password });
      router.replace('/dashboard');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Không kết nối được máy chủ'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Đăng nhập</h1>
        <p className="text-sm text-ink-secondary">Quản lý chi tiêu cá nhân</p>
      </header>

      <Card className="p-5">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field label="Email" error={error?.fieldError('email')}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              invalid={Boolean(error?.fieldError('email'))}
            />
          </Field>

          <Field label="Mật khẩu" error={error?.fieldError('password')}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              invalid={Boolean(error?.fieldError('password'))}
            />
          </Field>

          {/* Lỗi chung (sai mật khẩu, rate limit) hiện riêng — nó không thuộc field nào */}
          {error && !error.fieldErrors && (
            <p className="text-sm text-critical" role="alert">
              {error.status === 429
                ? 'Thử quá nhiều lần. Đợi một phút rồi thử lại.'
                : error.message}
            </p>
          )}

          <Button type="submit" variant="primary" loading={submitting} className="w-full">
            Đăng nhập
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-ink-secondary">
        Chưa có tài khoản?{' '}
        <Link href="/register" className="font-medium text-accent underline">
          Đăng ký
        </Link>
      </p>

      {/* Tài khoản demo điền sẵn để mở lên là dùng được ngay, không phải đi tìm */}
      <p className="text-center text-sm text-ink-muted">
        Tài khoản demo đã điền sẵn — chạy <code>npm run db:seed</code> để có dữ liệu mẫu.
      </p>
    </main>
  );
}
