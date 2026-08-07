'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AuthShell } from '@/components/auth-shell';
import { Button, Field, Input } from '@/components/ui';

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
    <AuthShell
      title="Đăng nhập"
      subtitle="Quản lý chi tiêu cá nhân"
      footer={
        <>
          <p className="text-sm text-ink-secondary">
            Chưa có tài khoản?{' '}
            <Link href="/register" className="font-medium text-accent underline">
              Đăng ký
            </Link>
          </p>

          {/* Tài khoản demo điền sẵn để mở lên là dùng được ngay, không phải đi tìm */}
          <p className="text-sm text-ink-muted">
            Tài khoản demo đã điền sẵn — chạy{' '}
            <code className="rounded-token-sm bg-surface-hover px-1.5 py-0.5 text-xs">
              npm run db:seed
            </code>{' '}
            để có dữ liệu mẫu.
          </p>
        </>
      }
    >
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
    </AuthShell>
  );
}
