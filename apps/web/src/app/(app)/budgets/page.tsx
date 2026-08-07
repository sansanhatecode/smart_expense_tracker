'use client';

import type { BudgetDto } from '@expense/shared';
import { formatVnd } from '@expense/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useCategories } from '@/lib/queries';
import { currentMonthKey, formatMonth, monthKeyOptions } from '@/lib/utils';
import { BudgetForm } from '@/components/budgets/BudgetForm';
import { BudgetList } from '@/components/budgets/BudgetList';
import { QueryBoundary } from '@/components/QueryBoundary';
import {
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
} from '@/components/ui';

/** 12 tháng để chọn kỳ — quá khứ để xem lại, tháng sau để đặt ngân sách trước. */
const MONTH_OPTIONS = { count: 12, ahead: 1 };

export default function BudgetsPage() {
  const [month, setMonth] = useState(currentMonthKey());
  /** Ngân sách đang chờ xác nhận xoá. `null` = hộp xác nhận đang đóng. */
  const [confirming, setConfirming] = useState<BudgetDto | null>(null);
  const queryClient = useQueryClient();
  const categories = useCategories();

  const budgets = useQuery({
    queryKey: ['budgets', month],
    queryFn: () => api.get<BudgetDto[]>('/api/budgets', { month }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['budgets'] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/budgets/${id}`),
    onSuccess: () => {
      invalidate();
      setConfirming(null);
    },
    // Lỗi hiện trong hộp xác nhận và hộp ở lại để bấm lại được.
  });

  // Chỉ danh mục CHI mới đặt được ngân sách — API cũng từ chối danh mục thu
  const expenseCategories = (categories.data ?? []).filter((c) => c.type === 'expense');
  const used = new Set((budgets.data ?? []).map((b) => b.category.id));
  const available = expenseCategories.filter((c) => !used.has(c.id));

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Ngân sách"
        subtitle={formatMonth(month)}
        actions={
          <Select
            aria-label="Chọn kỳ"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-44"
          >
            {monthKeyOptions(MONTH_OPTIONS.count, MONTH_OPTIONS.ahead).map((option) => (
              <option key={option} value={option}>
                {formatMonth(option)}
              </option>
            ))}
          </Select>
        }
      />

      {available.length > 0 && (
        <BudgetForm month={month} categories={available} onDone={invalidate} />
      )}

      <Card>
        <CardHeader
          title="Ngân sách theo danh mục"
          subtitle="Số đã chi được tính từ giao dịch thực tế trong kỳ"
        />
        <div className="mt-4 px-5 pb-5">
          <QueryBoundary
            query={budgets}
            skeleton={
              <div className="space-y-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            }
          >
            {(data) =>
              data.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="Chưa đặt ngân sách nào cho kỳ này"
                  description="Đặt hạn mức cho danh mục chi để được cảnh báo khi sắp vượt."
                />
              ) : (
                <BudgetList
                  budgets={data}
                  deleting={remove.isPending}
                  onDelete={(budget) => {
                    // Xoá lỗi lần trước, không thì nó hiện ngay lúc hộp vừa mở.
                    remove.reset();
                    setConfirming(budget);
                  }}
                />
              )
            }
          </QueryBoundary>
        </div>
      </Card>

      {/*
        Xoá ngân sách KHÔNG chạm vào giao dịch — nói thẳng điều đó. Nút Xoá nằm
        cạnh thanh đo mức chi, nên nỗi lo hợp lý ở đây là "xoá luôn khoản đã chi
        à?", và câu trả lời phải có trước khi bấm.
      */}
      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? `Xoá ngân sách cho "${confirming.category.name}"?` : ''}
        confirmLabel="Xoá ngân sách"
        busy={remove.isPending}
        error={remove.error instanceof ApiError ? remove.error.message : undefined}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && remove.mutate(confirming.id)}
      >
        {confirming && (
          <p>
            Hạn mức {formatVnd(confirming.limitAmount)} của {formatMonth(month)} sẽ bị bỏ. Giao
            dịch và số đã chi {formatVnd(confirming.spent)} không bị ảnh hưởng — chỉ mất phần
            theo dõi hạn mức.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
