'use client';

import type { CategoryDto, CategoryRuleDto, CreateCategoryInput, TxType } from '@expense/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Tag, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useCategories } from '@/lib/queries';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CategoryIcon,
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

  const remove = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ untaggedTransactions: number }>(`/api/categories/${id}`),
    onSuccess: (result) => {
      invalidate();
      // Nói rõ điều đã xảy ra: giao dịch KHÔNG bị xoá, chỉ mất phân loại
      if (result.untaggedTransactions > 0) {
        alert(
          `Đã xoá danh mục. ${result.untaggedTransactions} giao dịch chuyển sang "chưa phân loại" — không giao dịch nào bị xoá.`,
        );
      }
    },
    onError: (error) => alert(error instanceof ApiError ? error.message : 'Không xoá được'),
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

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{category.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                        <span>{category.transactionCount ?? 0} giao dịch</span>
                        {(ruleCountByCategory.get(category.id) ?? 0) > 0 && (
                          <Badge className="text-[0.75rem]">
                            {ruleCountByCategory.get(category.id)} rule
                          </Badge>
                        )}
                      </p>
                    </div>

                    <Button
                      variant="danger"
                      size="sm"
                      aria-label={`Xoá ${category.name}`}
                      disabled={remove.isPending}
                      onClick={() => {
                        const count = category.transactionCount ?? 0;
                        const message =
                          count > 0
                            ? `Xoá "${category.name}"? ${count} giao dịch sẽ chuyển sang "chưa phân loại" (không bị xoá).`
                            : `Xoá "${category.name}"?`;
                        if (confirm(message)) remove.mutate(category.id);
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
