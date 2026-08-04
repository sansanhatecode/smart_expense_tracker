'use client';

import type { CategoryDto, CategoryRuleDto, CreateCategoryInput, TxType } from '@expense/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Tag, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useCategories } from '@/lib/queries';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CategoryIcon,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
} from '@/components/ui';

/**
 * Bảng màu cho danh mục mới.
 *
 * Đây là màu TRANG TRÍ: identity của danh mục do tên và icon mang, không do màu —
 * không tồn tại nhiều màu categorical phân biệt được, và người dùng tạo được
 * danh mục không giới hạn nên không bảng màu nào phủ hết. Các giá trị này lấy từ
 * bảng đã qua validator nên mỗi swatch đều nhìn thấy được.
 */
const PALETTE = [
  '#eb6834', '#008300', '#2a78d6', '#e87ba4', '#eda100', '#e34948',
  '#4a3aa7', '#1baf7a', '#0d9488', '#b45309', '#898781',
];

const ICONS = [
  'UtensilsCrossed', 'ShoppingCart', 'Car', 'ShoppingBag', 'Receipt', 'HeartPulse',
  'Clapperboard', 'GraduationCap', 'ArrowLeftRight', 'Landmark', 'Wallet', 'Gift',
  'PiggyBank', 'Coffee', 'Home', 'Plane', 'Dumbbell', 'Baby', 'Tag',
];

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

  // Tính ngoài JSX để hộp xác nhận không phải lồng điều kiện cho từng câu.
  const confirmingTxCount = confirming?.transactionCount ?? 0;
  const confirmingRuleCount = confirming ? ruleCountByCategory.get(confirming.id) ?? 0 : 0;

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
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Danh mục</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            {rules.data ? `${rules.data.length} rule tự phân loại` : 'Đang tải…'}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm((open) => !open)}>
          {showForm ? <X aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
          {showForm ? 'Đóng' : 'Thêm danh mục'}
        </Button>
      </header>

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
          <Card key={group.type}>
            <CardHeader title={group.label} subtitle={`${group.items.length} danh mục`} />
            {group.items.length === 0 ? (
              <EmptyState icon={Tag} title="Chưa có danh mục nào" />
            ) : (
              <ul className="mt-3 divide-y">
                {group.items.map((category) => (
                  <li key={category.id} className="flex items-center gap-3 px-5 py-3">
                    <CategoryIcon icon={category.icon} color={category.color} />

                    {/*
                      Chỉ phần tên + số đếm là link, KHÔNG phải cả dòng: nút Xoá
                      nằm cùng dòng, mà lồng button trong link thì bấm Xoá cũng
                      điều hướng theo.

                      `from=&to=` là cố ý — trang giao dịch hiểu tham số rỗng là
                      "không giới hạn kỳ". Số "N giao dịch" ở đây đếm từ đầu đến
                      giờ, nên link theo tháng hiện tại sẽ ra ít hơn hẳn con số
                      người dùng vừa bấm vào.
                    */}
                    <Link
                      href={`/transactions?categoryId=${category.id}&from=&to=`}
                      className="group min-w-0 flex-1"
                    >
                      <p className="truncate text-sm font-medium text-ink group-hover:underline">
                        {category.name}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                        <span>{category.transactionCount ?? 0} giao dịch</span>
                        {(ruleCountByCategory.get(category.id) ?? 0) > 0 && (
                          <Badge className="text-[0.75rem]">
                            {ruleCountByCategory.get(category.id)} rule
                          </Badge>
                        )}
                      </p>
                    </Link>

                    <Button
                      variant="danger"
                      size="sm"
                      aria-label={`Xoá ${category.name}`}
                      disabled={remove.isPending}
                      onClick={() => {
                        // Xoá lỗi của lần trước: để lại thì nó hiện ra ngay lúc
                        // hộp vừa mở, như thể lần này đã thất bại.
                        remove.reset();
                        setConfirming(category);
                      }}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))
      )}

      {/*
        Hộp xác nhận nói ĐỦ hậu quả, gồm cả thứ `confirm()` cũ bỏ sót: rule tự
        phân loại bị xoá theo danh mục (FK là onDelete: Cascade) và không dựng
        lại được, khác với giao dịch chỉ mất phân loại.
      */}
      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? `Xoá danh mục "${confirming.name}"?` : ''}
        confirmLabel="Xoá danh mục"
        busy={remove.isPending}
        error={remove.error instanceof ApiError ? remove.error.message : undefined}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && remove.mutate(confirming.id)}
      >
        <p>
          {confirmingTxCount > 0
            ? `${confirmingTxCount} giao dịch sẽ chuyển sang "chưa phân loại". Không giao dịch nào bị xoá.`
            : 'Danh mục này chưa có giao dịch nào.'}
        </p>
        {confirmingRuleCount > 0 && (
          <p>
            {confirmingRuleCount} rule tự phân loại của danh mục này bị xoá theo và không hoàn
            lại được — lần import sau sẽ không tự gán danh mục này nữa.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

function CategoryForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<TxType>('expense');
  const [icon, setIcon] = useState('Tag');
  const [color, setColor] = useState(PALETTE[0]!);
  const [error, setError] = useState<ApiError | null>(null);

  const create = useMutation({
    mutationFn: (input: CreateCategoryInput) => api.post<CategoryDto>('/api/categories', input),
    onSuccess: onDone,
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Lỗi không xác định')),
  });

  return (
    <Card className="p-5">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          create.mutate({ name, type, icon, color, sortOrder: 500 });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên danh mục" error={error?.fieldError('name')}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cà phê"
              required
              invalid={Boolean(error?.fieldError('name'))}
            />
          </Field>

          <Field label="Loại">
            <Select value={type} onChange={(e) => setType(e.target.value as TxType)}>
              <option value="expense">Chi</option>
              <option value="income">Thu</option>
            </Select>
          </Field>
        </div>

        <Field label="Icon" hint="Icon và tên là thứ nhận ra danh mục, không phải màu">
          <div className="flex flex-wrap gap-2">
            {ICONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setIcon(option)}
                aria-label={option}
                aria-pressed={icon === option}
                className={icon === option ? 'ring-2 ring-accent' : ''}
                style={{ borderRadius: 'var(--radius-sm)' }}
              >
                <CategoryIcon icon={option} color={color} />
              </button>
            ))}
          </div>
        </Field>

        <Field label="Màu" hint="Chỉ để nhận ra nhanh — không dùng để mã hoá biểu đồ">
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setColor(option)}
                aria-label={`Màu ${option}`}
                aria-pressed={color === option}
                className={`size-8 ${color === option ? 'ring-2 ring-offset-2 ring-accent' : ''}`}
                style={{ backgroundColor: option, borderRadius: 'var(--radius-sm)' }}
              />
            ))}
          </div>
        </Field>

        {error && !error.fieldErrors && (
          <p className="text-sm text-critical" role="alert">
            {error.status === 409 ? 'Đã có danh mục cùng tên và cùng loại' : error.message}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          loading={create.isPending}
          disabled={name.trim() === ''}
        >
          Tạo danh mục
        </Button>
      </form>
    </Card>
  );
}
