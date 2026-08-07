'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AuthShell } from '@/components/AuthShell';
import { Button, Field, Input } from '@/components/ui';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await register({ email, password, ...(name.trim() ? { name: name.trim() } : {}) });
      router.replace('/dashboard');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Không kết nối được máy chủ'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Đăng ký"
      subtitle="Tài khoản mới sẽ có sẵn 15 danh mục và bộ rule tự phân loại"
      footer={
        <p className="text-sm text-ink-secondary">
          Đã có tài khoản?{' '}
          <Link href="/login" className="font-medium text-accent underline">
            Đăng nhập
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Tên" hint="Không bắt buộc">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>

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

        <Field label="Mật khẩu" error={error?.fieldError('password')} hint="Ít nhất 8 ký tự">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            invalid={Boolean(error?.fieldError('password'))}
          />
        </Field>

        {error && !error.fieldErrors && (
          <p className="text-sm text-critical" role="alert">
            {error.status === 409
              ? 'Email này đã được đăng ký'
              : error.status === 429
                ? 'Thử quá nhiều lần. Đợi một phút rồi thử lại.'
                : error.message}
          </p>
        )}

        <Button type="submit" variant="primary" loading={submitting} className="w-full">
          Tạo tài khoản
        </Button>
      </form>
    </AuthShell>
  );
}
