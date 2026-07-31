'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ApiState =
  | { kind: 'checking' }
  | { kind: 'up'; database: string; uptime: number }
  | { kind: 'down'; reason: string };

/**
 * Trang trạng thái.
 *
 * Tồn tại để `npm run dev` chạy được trọn vẹn và nói cho người chạy biết hệ thống
 * đang ở đâu — thay vì một trang trắng hoặc 404 khiến phải đi đọc log để đoán.
 * Sẽ được thay bằng dashboard khi các trang chính xong.
 */
export default function StatusPage() {
  const [api, setApi] = useState<ApiState>({ kind: 'checking' });

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_URL}/health`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ database: string; uptime: number }>;
      })
      .then((body) => setApi({ kind: 'up', database: body.database, uptime: body.uptime }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setApi({
          kind: 'down',
          reason: error instanceof Error ? error.message : String(error),
        });
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm font-medium text-ink-muted">Smart Expense Tracker</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Backend đã sẵn sàng
        </h1>
        <p className="text-ink-secondary">
          Các trang giao diện đang được xây. Trang này để xác nhận hai process đã nối
          được với nhau.
        </p>
      </header>

      <section
        className="rounded-[--radius] border bg-surface p-5"
        style={{ borderRadius: 'var(--radius)' }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink">API</p>
            <p className="text-sm text-ink-muted">{API_URL}</p>
          </div>
          <StatusBadge state={api} />
        </div>

        {api.kind === 'up' && (
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-sm">
            <div>
              <dt className="text-ink-muted">Database</dt>
              <dd className="mt-0.5 font-medium text-ink">{api.database}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Uptime</dt>
              <dd className="mt-0.5 font-medium text-ink tabular">{api.uptime}s</dd>
            </div>
          </dl>
        )}

        {api.kind === 'down' && (
          <div className="mt-4 border-t pt-4 text-sm">
            <p className="text-ink-secondary">
              Không gọi được API ({api.reason}). Kiểm tra:
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-secondary">
              <li>
                Postgres đã chạy chưa — <Code>npm run db:up</Code>
              </li>
              <li>
                Đã migrate chưa — <Code>npm run db:migrate</Code>
              </li>
              <li>
                API có đang chạy ở cửa sổ khác — <Code>npm run dev:api</Code>
              </li>
            </ol>
          </div>
        )}
      </section>

      <section className="space-y-3 text-sm">
        <p className="font-medium text-ink">Đã xong</p>
        <ul className="space-y-1.5 text-ink-secondary">
          {[
            'Auth: JWT access token + refresh token có rotation và reuse detection',
            'Danh mục + rule auto-categorize (15 danh mục, 108 keyword tạo sẵn)',
            'Giao dịch: CRUD, filter, phân trang, gán danh mục hàng loạt',
            'Import CSV/XLSX: preview → confirm → rollback, chống trùng khi import lại',
            'Thống kê: tổng quan, theo danh mục, theo thời gian',
            'Ngân sách theo tháng + cảnh báo vượt ngưỡng',
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="text-good">
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function StatusBadge({ state }: { state: ApiState }) {
  // Trạng thái không bao giờ chỉ dựa vào màu: luôn có cả chữ và một dấu hiệu hình.
  const config = {
    checking: { text: 'Đang kiểm tra', color: 'var(--ink-muted)', mark: '···' },
    up: { text: 'Đang chạy', color: 'var(--status-good)', mark: '●' },
    down: { text: 'Không kết nối được', color: 'var(--status-critical)', mark: '▲' },
  }[state.kind];

  return (
    <span
      className="inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium"
      style={{ color: config.color }}
    >
      <span aria-hidden>{config.mark}</span>
      {config.text}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="rounded bg-surface-raised px-1.5 py-0.5 text-[0.8125rem] text-ink"
      style={{ borderRadius: 'var(--radius-sm)' }}
    >
      {children}
    </code>
  );
}
