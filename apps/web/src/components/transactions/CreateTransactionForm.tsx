'use client';

import type { CreateTransactionInput, TransactionDto, TxType } from '@expense/shared';
import { formatVnd, parseVndInput } from '@expense/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useCategories } from '@/lib/queries';
import { Button, Card, Field, Input, Select } from '@/components/ui';

export function CreateTransactionForm({ onDone }: { onDone: () => void }) {
  const categories = useCategories();
  const [type, setType] = useState<TxType>('expense');
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  // Chấp nhận cách người ta gõ thật: "50k", "1,5tr", "1.234.567"
  const amount = parseVndInput(amountText);

  const create = useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      api.post<TransactionDto>('/api/transactions', input),
    onSuccess: onDone,
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Lỗi không xác định')),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (amount === null) return;
    create.mutate({
      amount,
      type,
      date,
      description,
      categoryId: categoryId || null,
      accountId: null,
      balance: null,
      // Giao dịch nhập tay mặc định là chi tiêu thật. Đánh dấu nội bộ là việc
      // sửa sau, ở danh sách — không bắt người dùng nghĩ về nó lúc đang nhập.
      internalKind: null,
    });
  }

  return (
    <Card className="p-5">
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Loại">
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value as TxType);
              // Danh mục thuộc chiều cũ không dùng được nữa — API sẽ từ chối
              setCategoryId('');
            }}
          >
            <option value="expense">Chi</option>
            <option value="income">Thu</option>
          </Select>
        </Field>

        <Field
          label="Số tiền"
          error={error?.fieldError('amount')}
          hint={
            amountText === ''
              ? 'Gõ được "50k", "1,5tr", "1.234.567"'
              : amount === null
                ? undefined
                : formatVnd(amount)
          }
        >
          <Input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="50k"
            required
            invalid={amountText !== '' && amount === null}
          />
        </Field>

        <Field label="Ngày" error={error?.fieldError('date')}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>

        <Field label="Mô tả" error={error?.fieldError('description')}>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Cà phê sáng"
            required
          />
        </Field>

        <Field label="Danh mục" hint="Có thể để trống rồi gán sau">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Chưa phân loại</option>
            {(categories.data ?? [])
              .filter((category) => category.type === type)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </Select>
        </Field>

        <div className="flex items-end">
          <Button
            type="submit"
            variant="primary"
            loading={create.isPending}
            disabled={amount === null || description.trim() === ''}
            className="w-full"
          >
            Thêm
          </Button>
        </div>

        {error && !error.fieldErrors && (
          <p className="text-sm text-critical sm:col-span-2 lg:col-span-3" role="alert">
            {error.status === 409
              ? 'Giao dịch này đã tồn tại (trùng với một giao dịch đã có)'
              : error.message}
          </p>
        )}
      </form>
    </Card>
  );
}
