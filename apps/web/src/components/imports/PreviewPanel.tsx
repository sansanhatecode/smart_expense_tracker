'use client';

import type { ConfirmImportResultDto, ImportPreviewDto, StagedRowDto } from '@expense/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCategories, useInvalidateTransactions } from '@/lib/queries';
import { Card, ErrorState, Skeleton } from '@/components/ui';
import { PreviewSummary } from './PreviewSummary';
import { SkippedRowsCard } from './SkippedRowsCard';
import { StagedRowsCard } from './StagedRowsCard';

/**
 * Xem trước một lô đã upload: sửa danh mục, bỏ tick dòng, rồi mới ghi vào dữ liệu.
 *
 * Mọi mutation của lô nằm ở đây vì cả ba khối con đều đọc từ CÙNG một query
 * staging — sửa một dòng làm bảng đếm phía trên đổi theo, nên chỉ có một chỗ
 * invalidate.
 */
export function PreviewPanel({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const categories = useCategories();
  const invalidateTransactions = useInvalidateTransactions();

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
      invalidateTransactions();
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

  const { account, counts, rows, skippedRows, fileName } = preview.data;

  return (
    <div className="space-y-4">
      <PreviewSummary
        fileName={fileName}
        account={account}
        counts={counts}
        onDiscard={() => discard.mutate()}
        onConfirm={() => confirm.mutate()}
        discarding={discard.isPending}
        confirming={confirm.isPending}
      />

      <SkippedRowsCard rows={skippedRows} />

      <StagedRowsCard
        rows={rows}
        categories={categories.data ?? []}
        onUpdate={(rowId, patch) => updateRow.mutate({ rowId, patch })}
      />
    </div>
  );
}
