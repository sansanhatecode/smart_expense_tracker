'use client';

import type { CategoryDto, CategoryRuleDto, TxType } from '@expense/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useCategories } from '@/lib/queries';
import { CategoryForm } from '@/components/categories/CategoryForm';
import { CategoryGroupCard } from '@/components/categories/CategoryGroupCard';
import { DeleteCategoryDialog } from '@/components/categories/DeleteCategoryDialog';
import { Button, Card, ErrorState, PageHeader, Skeleton } from '@/components/ui';

export default function CategoriesPage() {
  const [showForm, setShowForm] = useState(false);
  /** Danh mục đang chờ xác nhận xoá. `null` = hộp xác nhận đang đóng. */
  const [confirming, setConfirming] = useState<CategoryDto | null>(null);
  const categories = useCategories();
  const queryClient = useQueryClient();

  const rules = useQuery({
    queryKey: ['category-rules'],
    queryFn: () => api.get<CategoryRuleDto[]>('/api/category-rules'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
    void queryClient.invalidateQueries({ queryKey: ['category-rules'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  /**
   * Hậu quả của việc xoá được nói TRƯỚC, trong hộp xác nhận, nên ở đây không báo
   * lại lần nữa: giao dịch chuyển sang "chưa phân loại" là điều người dùng vừa
   * đọc và vừa đồng ý, và bắt họ tắt thêm một hộp nữa để xác nhận điều đó không
   * thêm thông tin gì.
   *
   * Lỗi thì ngược lại — nó hiện TRONG hộp và hộp ở lại để bấm lại được, nên
   * không có onError ở đây.
   */
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ untaggedTransactions: number }>(`/api/categories/${id}`),
    onSuccess: () => {
      invalidate();
      setConfirming(null);
    },
  });

  const ruleCountByCategory = new Map<string, number>();
  for (const rule of rules.data ?? []) {
    ruleCountByCategory.set(
      rule.category.id,
      (ruleCountByCategory.get(rule.category.id) ?? 0) + 1,
    );
  }

  const grouped: Array<{ type: TxType; label: string; items: CategoryDto[] }> = [
    {
      type: 'expense',
      label: 'Chi',
      items: (categories.data ?? []).filter((c) => c.type === 'expense'),
    },
    {
      type: 'income',
      label: 'Thu',
      items: (categories.data ?? []).filter((c) => c.type === 'income'),
    },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Danh mục"
        subtitle={rules.data ? `${rules.data.length} rule tự phân loại` : 'Đang tải…'}
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowForm((open) => !open)}>
            {showForm ? (
              <X aria-hidden className="size-4" />
            ) : (
              <Plus aria-hidden className="size-4" />
            )}
            {showForm ? 'Đóng' : 'Thêm danh mục'}
          </Button>
        }
      />

      {showForm && (
        <CategoryForm
          onDone={() => {
            setShowForm(false);
            invalidate();
          }}
        />
      )}

      {categories.isPending ? (
        <Card className="p-5">
          <Skeleton className="h-64" />
        </Card>
      ) : categories.isError ? (
        <Card>
          <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />
        </Card>
      ) : (
        grouped.map((group) => (
          <CategoryGroupCard
            key={group.type}
            label={group.label}
            items={group.items}
            ruleCountByCategory={ruleCountByCategory}
            deleting={remove.isPending}
            onDelete={(category) => {
              // Xoá lỗi của lần trước: để lại thì nó hiện ra ngay lúc hộp vừa
              // mở, như thể lần này đã thất bại.
              remove.reset();
              setConfirming(category);
            }}
          />
        ))
      )}

      <DeleteCategoryDialog
        category={confirming}
        ruleCount={confirming ? ruleCountByCategory.get(confirming.id) ?? 0 : 0}
        busy={remove.isPending}
        error={remove.error instanceof ApiError ? remove.error.message : undefined}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && remove.mutate(confirming.id)}
      />
    </div>
  );
}
