'use client';

import type {
  AccountDto,
  CreateTransactionInput,
  InternalKind,
  Paginated,
  TransactionDto,
  TxType,
} from '@expense/shared';
import { formatVnd, parseVndInput } from '@expense/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Shuffle, Trash2, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
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
  accountId: string;
  internal: '' | 'only' | 'exclude';
  /** 'out' = chỉ khoản làm tiền rời khỏi nguồn. Loại trừ với `type`, xem `TYPE_OPTIONS`. */
  cashflow: '' | 'out';
  q: string;
  page: number;
}

/**
 * Ô "Loại" gộp cả chiều tiền và "tiền đã ra" vào một select.
 *
 * Ba lựa chọn đầu lọc theo cột `type`, còn "Tiền đã ra" là một định nghĩa khác
 * (bỏ khoản quẹt thẻ, giữ khoản trả sao kê) nên nó đi bằng tham số `cashflow`.
 * Gộp vì với người dùng cả bốn đều trả lời cùng một câu "cho tôi xem loại tiền
 * nào" — tách thành hai select cạnh nhau thì phải giải thích vì sao chọn cái
 * này lại phải bỏ cái kia.
 */
const TYPE_OPTIONS = [
  { value: '', label: 'Tất cả', patch: { type: '', cashflow: '' } },
  { value: 'expense', label: 'Chi', patch: { type: 'expense', cashflow: '' } },
  { value: 'income', label: 'Thu', patch: { type: 'income', cashflow: '' } },
  { value: 'cash_out', label: 'Tiền đã ra', patch: { type: '', cashflow: 'out' } },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  patch: Pick<Filters, 'type' | 'cashflow'>;
}>;

/** Nhãn của từng lý do "đây là tiền đổi chỗ, không phải chi tiêu". */
const INTERNAL_LABEL: Record<InternalKind, string> = {
  card_payment: 'Trả nợ thẻ',
  wallet_topup: 'Nạp ví',
  self_transfer: 'Chuyển nội bộ',
};

/**
 * useSearchParams cần Suspense trong app router, nếu không `next build` sẽ báo
 * lỗi prerender. Nó có ở đây vì các ô KPI của dashboard link sang đây kèm filter.
 */
export default function TransactionsPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-6xl" />}>
      <TransactionsView />
    </Suspense>
  );
}

function TransactionsView() {
  const month = currentMonthRange();
  const searchParams = useSearchParams();
  const initialInternal = searchParams.get('internal');
  const initialType = searchParams.get('type');

  const [filters, setFilters] = useState<Filters>({
    // Kỳ đến từ URL nếu có: dashboard link sang đây với đúng tháng đang xem, và
    // rơi về tháng hiện tại sẽ cho danh sách rỗng ngay sau khi vừa nói có N khoản.
    //
    // `?from=&to=` (có tham số nhưng để trống) là "không giới hạn kỳ" — trang
    // Danh mục dùng nó, vì số "N giao dịch" ở đó đếm từ đầu đến giờ chứ không
    // theo tháng. Chỉ khi tham số VẮNG MẶT mới rơi về tháng này.
    from: searchParams.get('from') ?? month.from,
    to: searchParams.get('to') ?? month.to,
    // Giá trị lạ trong URL rơi về "Tất cả" chứ không đi tiếp vào query: API
    // validate bằng zod nên `?type=abc` sẽ thành 400, và người dùng thấy màn
    // hình lỗi thay vì một danh sách.
    type: initialType === 'income' || initialType === 'expense' ? initialType : '',
    // `uncategorized` thắng `categoryId` ở cả FE và BE — xem buildWhere.
    categoryId: searchParams.get('categoryId') ?? '',
    uncategorized: searchParams.get('uncategorized') === 'true',
    accountId: searchParams.get('accountId') ?? '',
    internal: initialInternal === 'only' || initialInternal === 'exclude' ? initialInternal : '',
    cashflow: searchParams.get('cashflow') === 'out' ? 'out' : '',
    q: '',
    page: 1,
  });
  const [showForm, setShowForm] = useState(false);

  const categories = useCategories();
  const queryClient = useQueryClient();

  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<AccountDto[]>('/api/accounts'),
  });

  const transactions = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () =>
      api.get<Paginated<TransactionDto>>('/api/transactions', {
        // Ngày trống = không chặn đầu đó. Gửi chuỗi rỗng thì zod của API từ chối
        // (`dateOnlySchema` đòi đúng dạng YYYY-MM-DD) và cả trang thành màn hình
        // lỗi — tức xoá ô "Từ ngày" cũng đủ làm hỏng danh sách.
        from: filters.from || undefined,
        to: filters.to || undefined,
        type: filters.type || undefined,
        categoryId: filters.uncategorized ? undefined : filters.categoryId || undefined,
        uncategorized: filters.uncategorized ? 'true' : undefined,
        accountId: filters.accountId || undefined,
        internal: filters.internal || undefined,
        cashflow: filters.cashflow || undefined,
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

  /**
   * Van an toàn cho nhận diện tự động. Ví dụ người dùng trả hộ thẻ của người
   * khác: mô tả giống hệt một khoản trả nợ thẻ, nhưng đó là chi tiêu thật và
   * chỉ họ mới biết. Bỏ đánh dấu đưa nó trở lại thống kê ngay.
   */
  const setInternal = useMutation({
    mutationFn: ({ id, internalKind }: { id: string; internalKind: InternalKind | null }) =>
      api.patch<TransactionDto>(`/api/transactions/${id}`, { internalKind }),
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
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
              value={filters.cashflow === 'out' ? 'cash_out' : filters.type}
              onChange={(e) => {
                const option = TYPE_OPTIONS.find((item) => item.value === e.target.value);
                if (option) update(option.patch);
              }}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
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
          <Field label="Nguồn tiền">
            <Select
              value={filters.accountId}
              onChange={(e) => update({ accountId: e.target.value })}
            >
              <option value="">Tất cả</option>
              {(accounts.data ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Khoản nội bộ">
            <Select
              value={filters.internal}
              onChange={(e) => update({ internal: e.target.value as Filters['internal'] })}
            >
              <option value="">Hiện tất cả</option>
              <option value="only">Chỉ khoản nội bộ</option>
              <option value="exclude">Ẩn khoản nội bộ</option>
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

        {/* Bấm "Tiền đã ra" ở Tổng quan là tới đây. Nói ngay danh sách này đang
            đếm gì, vì nó vừa thiếu khoản quẹt thẻ vừa thêm khoản trả sao kê —
            không giải thích thì trông như filter bị lỗi. */}
        {filters.cashflow === 'out' && (
          <p className="mt-3 text-sm text-ink-secondary">
            Đang xem các khoản làm tiền rời khỏi nguồn của bạn. Không gồm khoản
            quẹt thẻ tín dụng chưa trả, nhưng có gồm khoản trả sao kê thẻ. Tổng
            của danh sách này khớp với ô{' '}
            <span className="font-medium text-ink">Tiền đã ra</span> ở Tổng quan.
          </p>
        )}

        {filters.internal === 'only' && (
          <p className="mt-3 text-sm text-ink-secondary">
            Đây là các khoản đã bị loại khỏi thống kê thu chi vì được coi là tiền
            đổi chỗ giữa các nguồn của bạn. Nếu có khoản nào thật sự là chi tiêu,
            bấm <span className="font-medium text-ink">Tính lại</span> để đưa nó
            trở lại.
          </p>
        )}
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
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                      <span className="tabular">{formatDate(tx.date)}</span>
                      {tx.account && <span className="truncate">{tx.account.name}</span>}
                      {tx.importBatchId && (
                        <Badge className="text-[0.75rem]">từ import</Badge>
                      )}
                      {/* Nói rõ dòng này KHÔNG nằm trong tổng thu chi, ngay tại
                          chỗ người dùng nhìn thấy số tiền của nó. */}
                      {tx.internalKind && (
                        <Badge className="text-[0.75rem]">
                          <Shuffle aria-hidden className="size-3" />
                          {INTERNAL_LABEL[tx.internalKind]} · ngoài thống kê
                        </Badge>
                      )}
                    </p>
                  </div>

                  {tx.internalKind && (
                    <Button
                      size="sm"
                      disabled={setInternal.isPending}
                      onClick={() => setInternal.mutate({ id: tx.id, internalKind: null })}
                    >
                      Tính lại
                    </Button>
                  )}

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
