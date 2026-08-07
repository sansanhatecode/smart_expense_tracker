'use client';

import type { BudgetDto, UpsertBudgetInput } from '@expense/shared';
import { formatVnd, parseVndInput } from '@expense/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Button, Card, Field, Input, Select } from '@/components/ui';

export function BudgetForm({
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
