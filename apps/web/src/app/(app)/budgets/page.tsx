'use client';

import type { BudgetDto, UpsertBudgetInput } from '@expense/shared';
import { formatVnd, parseVndInput } from '@expense/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useCategories } from '@/lib/queries';
import { currentMonthKey, formatMonth, monthKeyOptions } from '@/lib/utils';
import { BudgetMeter } from '@/components/charts';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
} from '@/components/ui';

/** 12 tháng để chọn kỳ — quá khứ để xem lại, tháng sau để đặt ngân sách trước. */
const MONTH_OPTIONS = { count: 12, ahead: 1 };

export default function BudgetsPage() {
  const [month, setMonth] = useState(currentMonthKey());
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
    onSuccess: invalidate,
  });

  // Chỉ danh mục CHI mới đặt được ngân sách — API cũng từ chối danh mục thu
  const expenseCategories = (categories.data ?? []).filter((c) => c.type === 'expense');
  const used = new Set((budgets.data ?? []).map((b) => b.category.id));
  const available = expenseCategories.filter((c) => !used.has(c.id));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Ngân sách</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">{formatMonth(month)}</p>
        </div>
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
      </header>

      {available.length > 0 && (
        <BudgetForm month={month} categories={available} onDone={invalidate} />
      )}

      <Card>
        <CardHeader
          title="Ngân sách theo danh mục"
          subtitle="Số đã chi được tính từ giao dịch thực tế trong kỳ"
        />
        <div className="mt-4 px-5 pb-5">
          {budgets.isPending ? (
            <div className="space-y-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : budgets.isError ? (
            <ErrorState error={budgets.error} onRetry={() => void budgets.refetch()} />
          ) : budgets.data.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Chưa đặt ngân sách nào cho kỳ này"
              description="Đặt hạn mức cho danh mục chi để được cảnh báo khi sắp vượt."
            />
          ) : (
            <ul className="space-y-6">
              {budgets.data.map((budget) => (
                <li key={budget.id} className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <BudgetMeter
                      name={budget.category.name}
                      icon={budget.category.icon}
                      color={budget.category.color}
                      spent={budget.spent}
                      limit={budget.limitAmount}
                      status={budget.status}
                    />
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    aria-label={`Xoá ngân sách ${budget.category.name}`}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm(`Xoá ngân sách cho "${budget.category.name}"?`)) {
                        remove.mutate(budget.id);
                      }
                    }}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function BudgetForm({
  month,
  categories,
  onDone,
}: {
  month: string;
  categories: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [limitText, setLimitText] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  const limitAmount = parseVndInput(limitText);

  const upsert = useMutation({
    mutationFn: (input: UpsertBudgetInput) => api.post<BudgetDto>('/api/budgets', input),
    onSuccess: () => {
      setCategoryId('');
      setLimitText('');
      setError(null);
      onDone();
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Lỗi không xác định')),
  });

  return (
    <Card className="p-5">
      <form
        className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!categoryId || limitAmount === null) return;
          upsert.mutate({ categoryId, month, limitAmount });
        }}
      >
        <Field label="Danh mục" error={error?.fieldError('categoryId')}>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            <option value="">Chọn danh mục chi…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Hạn mức tháng"
          error={error?.fieldError('limitAmount')}
          hint={
            limitText === ''
              ? 'Gõ được "3tr", "3.000.000"'
              : limitAmount === null
                ? undefined
                : formatVnd(limitAmount)
          }
        >
          <Input
            value={limitText}
            onChange={(e) => setLimitText(e.target.value)}
            placeholder="3tr"
            required
            invalid={limitText !== '' && limitAmount === null}
          />
        </Field>

        <div className="flex items-end">
          <Button
            type="submit"
            variant="primary"
            loading={upsert.isPending}
            disabled={!categoryId || limitAmount === null}
          >
            Đặt ngân sách
          </Button>
        </div>

        {error && !error.fieldErrors && (
          <p className="text-sm text-critical sm:col-span-3" role="alert">
            {error.message}
          </p>
        )}
      </form>
    </Card>
  );
}
