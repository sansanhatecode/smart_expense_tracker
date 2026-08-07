'use client';

import type { ImportBatchDto } from '@expense/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useInvalidateTransactions } from '@/lib/queries';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusBadge,
} from '@/components/ui';

export function BatchHistory({ onOpen }: { onOpen: (batchId: string) => void }) {
  const queryClient = useQueryClient();
  const invalidateTransactions = useInvalidateTransactions();
  /** Lần import đang chờ xác nhận hoàn lại. `null` = hộp xác nhận đang đóng. */
  const [confirming, setConfirming] = useState<ImportBatchDto | null>(null);

  const batches = useQuery({
    queryKey: ['imports'],
    queryFn: () => api.get<ImportBatchDto[]>('/api/imports'),
  });

  const rollback = useMutation({
    mutationFn: (id: string) => api.delete<{ removed: number }>(`/api/imports/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
      invalidateTransactions();
      setConfirming(null);
    },
    // Lỗi hiện trong hộp xác nhận và hộp ở lại để bấm lại được.
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
          <li
            key={batch.id}
            className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-surface-hover"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-token-sm bg-surface-hover">
              <FileSpreadsheet aria-hidden className="size-4 text-ink-muted" />
            </span>

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
                // `disabled`, không phải `loading`: mọi dòng dùng chung một
                // mutation, nên `loading` làm mọi nút trong danh sách cùng quay.
                // Trạng thái đang chạy đã hiện ở nút trong hộp xác nhận.
                disabled={rollback.isPending}
                onClick={() => {
                  // Xoá lỗi lần trước, không thì nó hiện ngay lúc hộp vừa mở.
                  rollback.reset();
                  setConfirming(batch);
                }}
              >
                <Undo2 aria-hidden className="size-4" />
                Hoàn lại
              </Button>
            )}
          </li>
        ))}
      </ul>

      {/*
        Hoàn lại là hành động nặng nhất trong app: nó xoá hàng loạt giao dịch
        THẬT. Nên hộp phải nói đủ tên file và số giao dịch — hai thứ để người
        dùng biết mình đang hoàn đúng lần import nào, khi lịch sử có nhiều lần
        import cùng một ngân hàng và tên file na ná nhau.
      */}
      <ConfirmDialog
        open={confirming !== null}
        title="Hoàn lại lần import này?"
        confirmLabel={
          confirming ? `Xoá ${confirming.transactionCount} giao dịch` : 'Hoàn lại'
        }
        busy={rollback.isPending}
        error={rollback.error instanceof ApiError ? rollback.error.message : undefined}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && rollback.mutate(confirming.id)}
      >
        {confirming && (
          <>
            <p className="font-medium text-ink">{confirming.fileName}</p>
            <p>
              {new Date(confirming.createdAt).toLocaleString('vi-VN')} ·{' '}
              {confirming.transactionCount} giao dịch
            </p>
            <p>
              Toàn bộ {confirming.transactionCount} giao dịch của lần import này sẽ bị xoá. Không
              hoàn lại được — muốn có lại thì phải import lại file. Danh mục bạn đã sửa tay cho
              các dòng đó cũng mất theo.
            </p>
          </>
        )}
      </ConfirmDialog>
    </Card>
  );
}
