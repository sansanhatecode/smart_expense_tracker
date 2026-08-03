'use client';

import type {
  BankProfileDto,
  ConfirmImportResultDto,
  ImportBatchDto,
  ImportPreviewDto,
  StagedRowDto,
} from '@expense/shared';
import { formatVnd } from '@expense/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, TriangleAlert, Undo2, Upload } from 'lucide-react';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useCategories } from '@/lib/queries';
import { formatDate } from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CategoryIcon,
  EmptyState,
  ErrorState,
  Field,
  Select,
  Skeleton,
  StatusBadge,
} from '@/components/ui';

export default function ImportsPage() {
  const [batchId, setBatchId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Import sao kê</h1>
        <p className="mt-0.5 text-sm text-ink-secondary">
          Tải file CSV hoặc Excel từ ngân hàng. Xem trước rồi mới ghi vào dữ liệu.
        </p>
      </header>

      {batchId ? (
        <PreviewPanel batchId={batchId} onClose={() => setBatchId(null)} />
      ) : (
        <>
          <UploadPanel onUploaded={setBatchId} />
          <BatchHistory onOpen={setBatchId} />
        </>
      )}
    </div>
  );
}

// ─── Upload ──────────────────────────────────────────────────────────────────

function UploadPanel({ onUploaded }: { onUploaded: (batchId: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [profile, setProfile] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [dragging, setDragging] = useState(false);

  const profiles = useQuery({
    queryKey: ['bank-profiles'],
    queryFn: () => api.get<BankProfileDto[]>('/api/imports/bank-profiles'),
    staleTime: Infinity,
  });

  const upload = useMutation({
    mutationFn: (selected: File) => {
      const form = new FormData();
      form.append('file', selected);
      if (profile) form.append('bankProfile', profile);
      return api.upload<ImportPreviewDto>('/api/imports', form);
    },
    onSuccess: (preview) => onUploaded(preview.batchId),
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Không tải được file')),
  });

  function selectFile(next: File | null) {
    setError(null);
    setFile(next);
  }

  return (
    <Card className="p-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        {/* Vùng kéo-thả: cũng là label của input để bàn phím dùng được */}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            selectFile(e.dataTransfer.files[0] ?? null);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-6 py-8 text-center transition-colors ${
            dragging ? 'border-accent bg-accent-soft' : 'hover:bg-surface-raised'
          }`}
          style={{ borderRadius: 'var(--radius)' }}
        >
          <input
            type="file"
            accept=".csv,.xlsx"
            className="sr-only"
            onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <FileSpreadsheet aria-hidden className="size-6 text-accent" />
              <span className="text-sm font-medium text-ink">{file.name}</span>
              <span className="text-sm text-ink-muted">
                {(file.size / 1024).toFixed(0)} KB · bấm để đổi file
              </span>
            </>
          ) : (
            <>
              <Upload aria-hidden className="size-6 text-ink-muted" />
              <span className="text-sm font-medium text-ink">
                Kéo file vào đây, hoặc bấm để chọn
              </span>
              <span className="text-sm text-ink-muted">.csv hoặc .xlsx</span>
            </>
          )}
        </label>

        <div className="space-y-4">
          <Field
            label="Ngân hàng / ví"
            hint="Để tự động nếu không chắc — hệ thống sẽ tự dò định dạng"
          >
            <Select value={profile} onChange={(e) => setProfile(e.target.value)}>
              <option value="">Tự động nhận dạng</option>
              {(profiles.data ?? [])
                .filter((item) => item.id !== 'generic')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
            </Select>
          </Field>

          <Button
            variant="primary"
            className="w-full"
            disabled={!file}
            loading={upload.isPending}
            onClick={() => file && upload.mutate(file)}
          >
            Xem trước
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-4 flex items-start gap-2 text-sm text-critical" role="alert">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error.message}
        </p>
      )}
    </Card>
  );
}

// ─── Preview ─────────────────────────────────────────────────────────────────

function PreviewPanel({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const categories = useCategories();

  const preview = useQuery({
    queryKey: ['imports', batchId],
    queryFn: () => api.get<ImportPreviewDto>(`/api/imports/${batchId}`),
  });

  const updateRow = useMutation({
    mutationFn: ({ rowId, patch }: { rowId: string; patch: Record<string, unknown> }) =>
      api.patch<StagedRowDto>(`/api/imports/${batchId}/rows/${rowId}`, patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['imports', batchId] }),
  });

  const confirm = useMutation({
    mutationFn: () => api.post<ConfirmImportResultDto>(`/api/imports/${batchId}/confirm`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
      onClose();
    },
  });

  const discard = useMutation({
    mutationFn: () => api.delete<{ removed: number }>(`/api/imports/${batchId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
      onClose();
    },
  });

  if (preview.isPending) {
    return (
      <Card className="p-5">
        <Skeleton className="h-64" />
      </Card>
    );
  }

  if (preview.isError) {
    return (
      <Card>
        <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
      </Card>
    );
  }

  const { counts, rows, skippedRows, fileName } = preview.data;

  return (
    <div className="space-y-4">
      {/* ─── Bảng đếm: trả lời "bấm xác nhận thì thêm bao nhiêu" TRƯỚC khi bấm ─── */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{fileName}</p>
            <p className="mt-0.5 text-sm text-ink-muted">
              Chưa có gì được ghi vào dữ liệu
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => discard.mutate()} loading={discard.isPending}>
              Bỏ
            </Button>
            <Button
              variant="primary"
              onClick={() => confirm.mutate()}
              loading={confirm.isPending}
              disabled={counts.willInsert === 0}
            >
              Xác nhận thêm {counts.willInsert} giao dịch
            </Button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
          <Stat label="Đọc được" value={String(counts.total)} />
          <Stat label="Sẽ thêm" value={String(counts.willInsert)} />
          <Stat
            label="Đã có sẵn"
            value={String(counts.duplicateInDb)}
            hint={counts.duplicateInDb > 0 ? 'bỏ tick sẵn' : undefined}
          />
          <Stat
            label="Chưa phân loại"
            value={String(counts.uncategorized)}
            hint={counts.uncategorized > 0 ? 'gán ở dưới' : undefined}
          />
        </dl>

        <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4">
          <Stat label="Tổng thu" value={formatVnd(counts.incomeTotal)} tone="income" />
          <Stat label="Tổng chi" value={formatVnd(counts.expenseTotal)} tone="expense" />
        </dl>
      </Card>

      {/* ─── Dòng không đọc được: nói lý do thay vì im lặng bỏ ─── */}
      {skippedRows.length > 0 && (
        <Card className="p-5">
          <CardHeader
            title={`${skippedRows.length} dòng không đọc được`}
            subtitle="Thường là dòng tổng cộng hoặc ghi chú ở cuối file"
          />
          <ul className="mt-3 space-y-2">
            {skippedRows.map((row) => (
              <li key={`${row.rowIndex}-${row.raw}`} className="text-sm">
                <span className="text-critical">{row.reason}</span>
                <span className="ml-2 text-ink-muted">— {row.raw.slice(0, 90)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ─── Bảng dòng ─── */}
      <Card>
        <CardHeader title="Các dòng trong file" subtitle="Bỏ tick dòng không muốn thêm" />
        <ul className="mt-3 divide-y">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5 ${
                row.selected ? '' : 'opacity-55'
              }`}
            >
              <input
                type="checkbox"
                checked={row.selected}
                aria-label={`Thêm ${row.description}`}
                className="size-4 shrink-0 accent-[var(--accent)]"
                onChange={(e) =>
                  updateRow.mutate({ rowId: row.id, patch: { selected: e.target.checked } })
                }
              />

              <CategoryIcon
                icon={row.category?.icon ?? 'CircleHelp'}
                color={row.category?.color ?? '#898781'}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{row.description}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                  <span className="tabular">{formatDate(row.date)}</span>
                  {row.duplicate === 'in_db' && (
                    <StatusBadge status="warning">Đã có trong dữ liệu</StatusBadge>
                  )}
                  {!row.category && <Badge className="text-[0.75rem]">chưa phân loại</Badge>}
                </p>
              </div>

              <Select
                aria-label={`Danh mục của ${row.description}`}
                value={row.category?.id ?? ''}
                className="h-8 w-full text-sm sm:w-44"
                onChange={(e) =>
                  updateRow.mutate({
                    rowId: row.id,
                    patch: { categoryId: e.target.value === '' ? null : e.target.value },
                  })
                }
              >
                <option value="">Chưa phân loại</option>
                {(categories.data ?? [])
                  .filter((category) => category.type === row.type)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </Select>

              <span
                className="w-32 shrink-0 text-right text-sm font-medium tabular"
                style={{
                  color: row.type === 'income' ? 'var(--series-income)' : 'var(--ink)',
                }}
              >
                {row.type === 'income' ? '+' : '−'}
                {formatVnd(row.amount)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'income' | 'expense';
}) {
  return (
    <div>
      <dt className="text-sm text-ink-secondary">{label}</dt>
      <dd
        className="mt-0.5 text-lg font-semibold"
        style={{
          color:
            tone === 'income'
              ? 'var(--series-income)'
              : tone === 'expense'
                ? 'var(--series-expense)'
                : 'var(--ink)',
        }}
      >
        {value}
      </dd>
      {hint && <p className="text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

// ─── Lịch sử import ──────────────────────────────────────────────────────────

function BatchHistory({ onOpen }: { onOpen: (batchId: string) => void }) {
  const queryClient = useQueryClient();

  const batches = useQuery({
    queryKey: ['imports'],
    queryFn: () => api.get<ImportBatchDto[]>('/api/imports'),
  });

  const rollback = useMutation({
    mutationFn: (id: string) => api.delete<{ removed: number }>(`/api/imports/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });

  if (batches.isPending) {
    return (
      <Card className="p-5">
        <Skeleton className="h-24" />
      </Card>
    );
  }

  if (batches.isError) {
    return (
      <Card>
        <ErrorState error={batches.error} onRetry={() => void batches.refetch()} />
      </Card>
    );
  }

  if (batches.data.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={FileSpreadsheet}
          title="Chưa import lần nào"
          description="Sau khi import, mỗi lần sẽ hiện ở đây và có thể hoàn lại toàn bộ."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Lịch sử import" subtitle="Hoàn lại được cả lô" />
      <ul className="mt-3 divide-y">
        {batches.data.map((batch) => (
          <li key={batch.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <FileSpreadsheet aria-hidden className="size-5 shrink-0 text-ink-muted" />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{batch.fileName}</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {new Date(batch.createdAt).toLocaleString('vi-VN')} · {batch.rowCount} dòng
                {batch.status === 'confirmed' && ` · ${batch.transactionCount} giao dịch`}
              </p>
            </div>

            {batch.status === 'pending' && (
              <StatusBadge status="warning">Chờ xác nhận</StatusBadge>
            )}
            {batch.status === 'confirmed' && (
              <StatusBadge status="good">Đã xác nhận</StatusBadge>
            )}
            {batch.status === 'rolled_back' && (
              <StatusBadge status="neutral">Đã hoàn lại</StatusBadge>
            )}

            {batch.status === 'pending' && (
              <Button size="sm" onClick={() => onOpen(batch.id)}>
                Tiếp tục
              </Button>
            )}

            {batch.status === 'confirmed' && (
              <Button
                variant="danger"
                size="sm"
                loading={rollback.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Hoàn lại lần import này? ${batch.transactionCount} giao dịch sẽ bị xoá.`,
                    )
                  ) {
                    rollback.mutate(batch.id);
                  }
                }}
              >
                <Undo2 aria-hidden className="size-4" />
                Hoàn lại
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
