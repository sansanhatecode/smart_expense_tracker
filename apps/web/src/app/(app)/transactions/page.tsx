'use client';

import type {
  CreateTransactionInput,
  Paginated,
  TransactionDto,
  TxType,
} from '@expense/shared';
import { formatVnd, parseVndInput } from '@expense/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useCategories } from '@/lib/queries';
import { currentMonthRange, formatDate } from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  CategoryIcon,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
} from '@/components/ui';

const PAGE_SIZE = 25;

interface Filters {
  from: string;
  to: string;
  type: '' | TxType;
  categoryId: string;
  uncategorized: boolean;
  q: string;
  page: number;
}

export default function TransactionsPage() {
  const month = currentMonthRange();
  const [filters, setFilters] = useState<Filters>({
    from: month.from,
    to: month.to,
    type: '',
    categoryId: '',
    uncategorized: false,
    q: '',
    page: 1,
  });
  const [showForm, setShowForm] = useState(false);

  const categories = useCategories();
  const queryClient = useQueryClient();

  const transactions = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () =>
      api.get<Paginated<TransactionDto>>('/api/transactions', {
        from: filters.from,
        to: filters.to,
        type: filters.type || undefined,
        categoryId: filters.uncategorized ? undefined : filters.categoryId || undefined,
        uncategorized: filters.uncategorized ? 'true' : undefined,
        q: filters.q || undefined,
        page: filters.page,
        limit: PAGE_SIZE,
      }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
    void queryClient.invalidateQueries({ queryKey: ['budgets'] });
  };

  const recategorize = useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string | null }) =>
      api.patch<TransactionDto>(`/api/transactions/${id}`, { categoryId }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/transactions/${id}`),
    onSuccess: invalidate,
  });

  /** Đổi filter thì luôn về trang 1 — giữ trang cũ có thể ra trang rỗng. */
  const update = (patch: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Giao dịch</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            {transactions.data
              ? `${transactions.data.total} giao dịch`
              : 'Đang tải…'}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm((open) => !open)}>
          {showForm ? <X aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
          {showForm ? 'Đóng' : 'Thêm giao dịch'}
        </Button>
      </header>

      {showForm && (
        <CreateTransactionForm
          onDone={() => {
            setShowForm(false);
            invalidate();
          }}
        />
      )}

      {/* ─── Filter: một hàng phía trên bảng ─── */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Từ ngày">
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => update({ from: e.target.value })}
            />
          </Field>
          <Field label="Đến ngày">
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => update({ to: e.target.value })}
            />
          </Field>
          <Field label="Loại">
            <Select
              value={filters.type}
              onChange={(e) => update({ type: e.target.value as Filters['type'] })}
            >
              <option value="">Tất cả</option>
              <option value="expense">Chi</option>
              <option value="income">Thu</option>
            </Select>
          </Field>
          <Field label="Danh mục">
            <Select
              value={filters.uncategorized ? '__none__' : filters.categoryId}
              onChange={(e) =>
                update(
                  e.target.value === '__none__'
                    ? { uncategorized: true, categoryId: '' }
                    : { uncategorized: false, categoryId: e.target.value },
                )
              }
            >
              <option value="">Tất cả</option>
              <option value="__none__">Chưa phân loại</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.type === 'income' ? '↑ ' : '↓ '}
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tìm trong mô tả">
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
              />
              <Input
                value={filters.q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="GRAB, HIGHLANDS…"
                className="pl-8"
              />
            </div>
          </Field>
        </div>
      </Card>

      {/* ─── Danh sách ─── */}
      <Card>
        {transactions.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : transactions.isError ? (
          <ErrorState
            error={transactions.error}
            onRetry={() => void transactions.refetch()}
          />
        ) : transactions.data.items.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Không có giao dịch nào khớp"
            description="Thử mở rộng khoảng ngày hoặc bỏ bớt điều kiện lọc."
          />
        ) : (
          <>
            <ul className="divide-y">
              {transactions.data.items.map((tx) => (
                <li
                  key={tx.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <CategoryIcon
                    icon={tx.category?.icon ?? 'CircleHelp'}
                    color={tx.category?.color ?? '#898781'}
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{tx.description}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-sm text-ink-muted">
                      <span className="tabular">{formatDate(tx.date)}</span>
                      {tx.importBatchId && (
                        <Badge className="text-[0.75rem]">từ import</Badge>
                      )}
                    </p>
                  </div>

                  {/* Đổi danh mục ngay tại dòng: sau import luôn còn một loạt
                      giao dịch chưa phân loại, mở dialog cho từng cái là lý do
                      người dùng bỏ giữa đường. */}
                  <Select
                    aria-label={`Danh mục của ${tx.description}`}
                    value={tx.category?.id ?? ''}
                    disabled={recategorize.isPending}
                    onChange={(e) =>
                      recategorize.mutate({
                        id: tx.id,
                        categoryId: e.target.value === '' ? null : e.target.value,
                      })
                    }
                    className="h-8 w-full text-sm sm:w-44"
                  >
                    <option value="">Chưa phân loại</option>
                    {(categories.data ?? [])
                      .filter((category) => category.type === tx.type)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </Select>

                  <span
                    className="w-32 shrink-0 text-right text-sm font-medium tabular"
                    style={{
                      color: tx.type === 'income' ? 'var(--series-income)' : 'var(--ink)',
                    }}
                  >
                    {tx.type === 'income' ? '+' : '−'}
                    {formatVnd(tx.amount)}
                  </span>

                  <Button
                    variant="danger"
                    size="sm"
                    aria-label={`Xoá ${tx.description}`}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm(`Xoá giao dịch "${tx.description}"?`)) {
                        remove.mutate(tx.id);
                      }
                    }}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>

            {transactions.data.totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
                <p className="text-sm text-ink-muted">
                  Trang {transactions.data.page} / {transactions.data.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={filters.page <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                  >
                    Trước
                  </Button>
                  <Button
                    size="sm"
                    disabled={filters.page >= transactions.data.totalPages}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                  >
                    Sau
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Form thêm giao dịch ─────────────────────────────────────────────────────

function CreateTransactionForm({ onDone }: { onDone: () => void }) {
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
