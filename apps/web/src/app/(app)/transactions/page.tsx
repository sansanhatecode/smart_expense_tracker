'use client';

import type { AccountDto, Paginated, TransactionDto, TxType } from '@expense/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Search, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useCategories, useInvalidateTransactions } from '@/lib/queries';
import { QueryBoundary } from '@/components/QueryBoundary';
import { CreateTransactionForm } from '@/components/transactions/CreateTransactionForm';
import {
  DeleteTransactionDialog,
  type DeleteTarget,
} from '@/components/transactions/DeleteTransactionDialog';
import { initialFilters, transactionQuery, type Filters } from '@/components/transactions/filters';
import { SelectionBar } from '@/components/transactions/SelectionBar';
import { Pagination, TransactionList } from '@/components/transactions/TransactionList';
import { TransactionFilters } from '@/components/transactions/TransactionFilters';
import { Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';

/**
 * useSearchParams cần Suspense trong app router, nếu không `next build` sẽ báo
 * lỗi prerender. Nó có ở đây vì các ô KPI của dashboard link sang đây kèm filter.
 */
export default function TransactionsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <TransactionsView />
    </Suspense>
  );
}

function TransactionsView() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => initialFilters(searchParams));
  const [showForm, setShowForm] = useState(false);

  /**
   * Các dòng đang tick, để gán danh mục hoặc xoá cả lô.
   *
   * Bị xoá sạch mỗi lần đổi filter hoặc sang trang (xem `update`): giữ lại thì
   * người dùng bấm Xoá và mất cả những dòng họ không còn nhìn thấy. Nhờ vậy mọi
   * id trong đây luôn nằm trong trang đang hiện — điều kiện để biết chiều thu/chi
   * của lô mà không phải hỏi lại server.
   */
  const [selected, setSelected] = useState<string[]>([]);

  /** Đang hỏi xoá cái gì. `null` = hộp xác nhận đang đóng. */
  const [confirming, setConfirming] = useState<DeleteTarget | null>(null);

  const categories = useCategories();
  const invalidate = useInvalidateTransactions();

  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<AccountDto[]>('/api/accounts'),
  });

  const transactions = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () =>
      api.get<Paginated<TransactionDto>>('/api/transactions', transactionQuery(filters)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/transactions/${id}`),
    onSuccess: () => {
      invalidate();
      setConfirming(null);
    },
    // Lỗi hiện trong hộp xác nhận, và hộp ở lại để bấm lại được — xem `deleteError`.
  });

  const bulkCategorize = useMutation({
    mutationFn: (categoryId: string | null) =>
      api.patch<{ updated: number }>('/api/transactions/bulk-categorize', {
        transactionIds: selected,
        categoryId,
      }),
    onSuccess: () => {
      invalidate();
      setSelected([]);
    },
    // API chặn lô lệch chiều thu/chi và message của nó nói được cách sửa, nên
    // hiện thẳng ra thay vì thay bằng câu chung chung. Chỗ hiện là chính thanh
    // hành động — xem prop `error` của SelectionBar.
  });

  const bulkRemove = useMutation({
    mutationFn: () =>
      api.delete<{ deleted: number }>('/api/transactions', { transactionIds: selected }),
    onSuccess: () => {
      invalidate();
      setSelected([]);
      setConfirming(null);
    },
  });

  /**
   * Mở hộp xác nhận. Xoá lỗi của lần trước trước khi mở: lỗi cũ còn nằm đó sẽ
   * hiện ra ngay lúc hộp vừa mở, như thể lần này đã thất bại.
   */
  const askDelete = (target: DeleteTarget) => {
    remove.reset();
    bulkRemove.reset();
    setConfirming(target);
  };

  const deleteBusy = remove.isPending || bulkRemove.isPending;
  const deleteError = remove.error ?? bulkRemove.error;

  /**
   * Đổi filter thì luôn về trang 1 — giữ trang cũ có thể ra trang rỗng.
   *
   * Đây là cửa duy nhất để đổi filter VÀ trang, nên cũng là chỗ duy nhất cần xoá
   * lựa chọn. Phân trang cũng đi qua đây vì lý do đó.
   */
  const update = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
    setSelected([]);
  };

  const rows = transactions.data?.items ?? [];
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));
  const someSelected = selected.length > 0 && !allSelected;

  /**
   * Chiều thu/chi của lô đang chọn, `null` nếu lô trộn cả hai.
   *
   * Quyết định danh mục nào được phép gán: danh mục thu không dùng được cho giao
   * dịch chi (API sẽ từ chối), nên chỉ hiện đúng những cái gán được — báo lỗi sau
   * khi bấm là cách tệ hơn để nói cùng một điều.
   */
  const selectedType = ((): TxType | null => {
    const types = new Set(rows.filter((row) => selected.includes(row.id)).map((row) => row.type));

    return types.size === 1 ? [...types][0]! : null;
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Giao dịch"
        subtitle={transactions.data ? `${transactions.data.total} giao dịch` : 'Đang tải…'}
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowForm((open) => !open)}>
            {showForm ? (
              <X aria-hidden className="size-4" />
            ) : (
              <Plus aria-hidden className="size-4" />
            )}
            {showForm ? 'Đóng' : 'Thêm giao dịch'}
          </Button>
        }
      />

      {showForm && (
        <CreateTransactionForm
          onDone={() => {
            setShowForm(false);
            invalidate();
          }}
        />
      )}

      <TransactionFilters
        filters={filters}
        categories={categories.data ?? []}
        accounts={accounts.data ?? []}
        onChange={update}
      />

      <Card>
        <QueryBoundary
          query={transactions}
          skeleton={
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          }
        >
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Không có giao dịch nào khớp"
                description="Thử mở rộng khoảng ngày hoặc bỏ bớt điều kiện lọc."
              />
            ) : (
              <>
                <SelectionBar
                  count={selected.length}
                  allSelected={allSelected}
                  someSelected={someSelected}
                  onToggleAll={() =>
                    setSelected(allSelected ? [] : data.items.map((row) => row.id))
                  }
                  categories={categories.data ?? []}
                  selectedType={selectedType}
                  busy={bulkCategorize.isPending || bulkRemove.isPending}
                  error={
                    bulkCategorize.error instanceof ApiError
                      ? bulkCategorize.error.message
                      : undefined
                  }
                  onCategorize={(categoryId) => {
                    // Xoá lỗi lần trước trước khi thử lại, không thì người dùng
                    // không phân biệt được lỗi cũ với kết quả lần này.
                    bulkCategorize.reset();
                    bulkCategorize.mutate(categoryId);
                  }}
                  onDelete={() => askDelete({ kind: 'bulk', count: selected.length })}
                  onClear={() => setSelected([])}
                />

                <TransactionList
                  items={data.items}
                  categories={categories.data ?? []}
                  selected={selected}
                  onToggle={(id) =>
                    setSelected((current) =>
                      current.includes(id)
                        ? current.filter((item) => item !== id)
                        : [...current, id],
                    )
                  }
                  onDelete={(tx) => askDelete({ kind: 'one', tx })}
                  deleting={remove.isPending}
                />

                {data.totalPages > 1 && (
                  <Pagination
                    page={data.page}
                    totalPages={data.totalPages}
                    // Qua `update` chứ không `setFilters` trực tiếp: sang trang
                    // phải xoá lựa chọn, và `update` là chỗ giữ quy tắc đó.
                    onChange={(page) => update({ page })}
                  />
                )}
              </>
            )
          }
        </QueryBoundary>
      </Card>

      <DeleteTransactionDialog
        target={confirming}
        busy={deleteBusy}
        error={deleteError instanceof ApiError ? deleteError.message : undefined}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming?.kind === 'one') remove.mutate(confirming.tx.id);
          else if (confirming?.kind === 'bulk') bulkRemove.mutate();
        }}
      />
    </div>
  );
}
