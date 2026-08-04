'use client';

import type {
  AccountDto,
  CategoryDto,
  CreateTransactionInput,
  InternalFilter,
  InternalKind,
  Paginated,
  TransactionDto,
  TxType,
} from '@expense/shared';
import { expandInternalFilter, formatVnd, parseVndInput } from '@expense/shared';
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
  MultiSelect,
  Select,
  Skeleton,
  type MultiSelectOption,
} from '@/components/ui';

const PAGE_SIZE = 25;

/**
 * Giá trị đại diện mục "không có" trong danh sách tick được: "Chưa phân loại" ở
 * danh mục, "Không rõ nguồn" ở nguồn tiền.
 *
 * Cần một token riêng vì hai mục đó là `IS NULL` chứ không phải một id, nên
 * chúng đi lên API bằng tham số khác (`uncategorized`, `noAccount`). Chuỗi có
 * gạch dưới hai đầu để không đụng id thật.
 */
const NONE = '__none__';

/** Danh sách tick → tham số id cho API, đã bỏ `NONE`. Rỗng → không gửi. */
function idsParam(values: string[]): string | undefined {
  const ids = values.filter((value) => value !== NONE);

  return ids.length > 0 ? ids.join(',') : undefined;
}

interface Filters {
  /** Rỗng = không chặn đầu đó. */
  from: string;
  to: string;
  type: '' | TxType;
  /** Có thể chứa `NONE`. */
  categoryIds: string[];
  /** Có thể chứa `NONE`. */
  accountIds: string[];
  /** 'none' = khoản KHÔNG nội bộ, ba giá trị còn lại là từng lý do một. */
  internal: InternalFilter[];
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

/** Nhãn của từng mục ở ô "Khoản nội bộ", theo thứ tự hiện ra. */
const INTERNAL_OPTIONS: MultiSelectOption[] = [
  { value: 'none', label: 'Không phải khoản nội bộ' },
  { value: 'card_payment', label: 'Trả nợ thẻ' },
  { value: 'wallet_topup', label: 'Nạp ví' },
  { value: 'self_transfer', label: 'Chuyển nội bộ' },
];

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
  const initialType = searchParams.get('type');

  /** `'a,b'` → `['a','b']`. Vắng mặt hoặc rỗng → `[]`. */
  const csv = (name: string) =>
    (searchParams.get(name) ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '');

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
    // "Chưa phân loại" / "Không rõ nguồn" đi lên API bằng tham số riêng, nhưng
    // trong state chúng là một phần tử của danh sách tick — người dùng thấy đúng
    // một danh sách, không phải một danh sách cộng một checkbox lẻ.
    categoryIds: [
      ...csv('categoryId'),
      ...(searchParams.get('uncategorized') === 'true' ? [NONE] : []),
    ],
    accountIds: [
      ...csv('accountId'),
      ...(searchParams.get('noAccount') === 'true' ? [NONE] : []),
    ],
    // Dịch `internal=exclude` của các link cũ về dạng chuẩn bằng đúng hàm mà API
    // dùng, nên hai bên không thể hiểu lệch nhau.
    internal: expandInternalFilter(csv('internal')),
    cashflow: searchParams.get('cashflow') === 'out' ? 'out' : '',
    q: '',
    page: 1,
  });
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
        // Tách `NONE` ra khỏi danh sách id: nó là `IS NULL` nên đi bằng tham số
        // riêng. Gửi kèm cả hai nghĩa union — xem buildWhere.
        categoryId: idsParam(filters.categoryIds),
        uncategorized: filters.categoryIds.includes(NONE) ? 'true' : undefined,
        accountId: idsParam(filters.accountIds),
        noAccount: filters.accountIds.includes(NONE) ? 'true' : undefined,
        internal: filters.internal.length > 0 ? filters.internal.join(',') : undefined,
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
    // hiện thẳng ra thay vì thay bằng câu chung chung.
    onError: (error) =>
      alert(error instanceof ApiError ? error.message : 'Không gán được danh mục'),
  });

  const bulkRemove = useMutation({
    mutationFn: () =>
      api.delete<{ deleted: number }>('/api/transactions', { transactionIds: selected }),
    onSuccess: () => {
      invalidate();
      setSelected([]);
    },
    onError: (error) => alert(error instanceof ApiError ? error.message : 'Không xoá được'),
  });

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

  // Mục "không có" đứng đầu danh sách: sau import luôn còn một mớ chưa phân loại,
  // và nó là thứ người dùng tìm nhiều nhất ở đây.
  const categoryOptions: MultiSelectOption[] = [
    { value: NONE, label: 'Chưa phân loại' },
    ...(categories.data ?? []).map((category) => ({
      value: category.id,
      // Mũi tên phân biệt danh mục thu với danh mục chi cùng tên.
      label: `${category.type === 'income' ? '↑' : '↓'} ${category.name}`,
    })),
  ];

  const accountOptions: MultiSelectOption[] = [
    { value: NONE, label: 'Không rõ nguồn' },
    ...(accounts.data ?? []).map((account) => ({
      value: account.id,
      label: account.name,
    })),
  ];

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
          <Field label="Danh mục" as="div">
            <MultiSelect
              label="Lọc theo danh mục"
              options={categoryOptions}
              selected={filters.categoryIds}
              onChange={(categoryIds) => update({ categoryIds })}
            />
          </Field>
          <Field label="Nguồn tiền" as="div">
            <MultiSelect
              label="Lọc theo nguồn tiền"
              options={accountOptions}
              selected={filters.accountIds}
              onChange={(accountIds) => update({ accountIds })}
            />
          </Field>
          <Field label="Khoản nội bộ" as="div">
            <MultiSelect
              label="Lọc theo khoản nội bộ"
              options={INTERNAL_OPTIONS}
              selected={filters.internal}
              // Panel chỉ trả về giá trị từ INTERNAL_OPTIONS, nhưng vẫn lọc qua
              // expandInternalFilter để state không thể nhận giá trị lạ.
              onChange={(values) => update({ internal: expandInternalFilter(values) })}
              allLabel="Hiện tất cả"
            />
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

        {/* Hiện khi đang xem ít nhất một LOẠI khoản nội bộ. Tick thêm "Không phải
            khoản nội bộ" thì danh sách có cả hai thứ, dòng này vẫn đúng và vẫn
            cần: nút "Tính lại" chỉ có ở các dòng nội bộ. */}
        {filters.internal.some((value) => value !== 'none') && (
          <p className="mt-3 text-sm text-ink-secondary">
            Các khoản nội bộ đã bị loại khỏi thống kê thu chi vì được coi là tiền
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
            {/*
              Hàng chọn cả trang. Nằm trong cùng một Card với danh sách và ngay
              trên nó, vì "cả trang" nghĩa là đúng những dòng nhìn thấy bên dưới.
            */}
            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5">
              <input
                type="checkbox"
                className="size-4 shrink-0"
                style={{ accentColor: 'var(--accent)' }}
                aria-label="Chọn tất cả giao dịch trong trang"
                checked={allSelected}
                // Tick một phần thì ô hiện dấu gạch, không phải ô trống: ô trống
                // nói sai rằng chưa chọn gì.
                ref={(node) => {
                  if (node) node.indeterminate = someSelected;
                }}
                onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))}
              />

              {selected.length === 0 ? (
                <span className="text-sm text-ink-muted">
                  Tick để gán danh mục hoặc xoá nhiều giao dịch một lượt
                </span>
              ) : (
                <BulkActions
                  count={selected.length}
                  categories={categories.data ?? []}
                  selectedType={selectedType}
                  busy={bulkCategorize.isPending || bulkRemove.isPending}
                  onCategorize={(categoryId) => bulkCategorize.mutate(categoryId)}
                  onDelete={() => {
                    if (
                      confirm(
                        `Xoá ${selected.length} giao dịch đã chọn? Việc này không hoàn lại được.`,
                      )
                    ) {
                      bulkRemove.mutate();
                    }
                  }}
                  onClear={() => setSelected([])}
                />
              )}
            </div>

            <ul className="divide-y">
              {transactions.data.items.map((tx) => (
                <li
                  key={tx.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0"
                    style={{ accentColor: 'var(--accent)' }}
                    aria-label={`Chọn ${tx.description}`}
                    checked={selected.includes(tx.id)}
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(tx.id)
                          ? current.filter((id) => id !== tx.id)
                          : [...current, tx.id],
                      )
                    }
                  />

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
                  {/* Qua `update` chứ không `setFilters` trực tiếp: sang trang
                      phải xoá lựa chọn, và `update` là chỗ giữ quy tắc đó. */}
                  <Button
                    size="sm"
                    disabled={filters.page <= 1}
                    onClick={() => update({ page: filters.page - 1 })}
                  >
                    Trước
                  </Button>
                  <Button
                    size="sm"
                    disabled={filters.page >= transactions.data.totalPages}
                    onClick={() => update({ page: filters.page + 1 })}
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

// ─── Thao tác trên nhiều dòng ────────────────────────────────────────────────

/**
 * Thanh hành động cho lô đang chọn.
 *
 * Chỉ hiện những danh mục gán ĐƯỢC: API từ chối gán giao dịch chi vào danh mục
 * thu, nên đưa chúng vào select rồi báo lỗi sau khi bấm là cách tệ hơn để nói
 * cùng một điều. Lô trộn cả thu lẫn chi thì không danh mục nào hợp cả hai — lúc
 * đó chỉ còn "Chưa phân loại" (bỏ danh mục), kèm câu giải thích.
 */
function BulkActions({
  count,
  categories,
  selectedType,
  busy,
  onCategorize,
  onDelete,
  onClear,
}: {
  count: number;
  categories: CategoryDto[];
  /** null = lô trộn cả thu lẫn chi. */
  selectedType: TxType | null;
  busy: boolean;
  onCategorize: (categoryId: string | null) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const usable = selectedType ? categories.filter((item) => item.type === selectedType) : [];

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-ink">Đã chọn {count}</span>

      <Select
        aria-label="Gán danh mục cho các giao dịch đã chọn"
        // Luôn quay về placeholder: đây là một hành động, không phải trạng thái
        // của lô — lô có thể đang gồm nhiều danh mục khác nhau.
        value=""
        disabled={busy}
        onChange={(e) => {
          if (e.target.value === '') return;
          onCategorize(e.target.value === NONE ? null : e.target.value);
        }}
        className="h-8 w-full text-sm sm:w-52"
      >
        <option value="">Gán danh mục…</option>
        <option value={NONE}>Chưa phân loại</option>
        {usable.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>

      {selectedType === null && (
        <span className="text-sm text-ink-muted">
          Lô có cả giao dịch thu và chi nên không danh mục nào dùng chung được
        </span>
      )}

      <Button variant="danger" size="sm" disabled={busy} onClick={onDelete}>
        <Trash2 aria-hidden className="size-4" />
        Xoá {count} giao dịch
      </Button>

      <Button variant="ghost" size="sm" disabled={busy} onClick={onClear}>
        Bỏ chọn
      </Button>
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
