'use client';

import type { CategoryDto, CreateCategoryInput, TxType } from '@expense/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, Card, CategoryIcon, Field, Input, Select } from '@/components/ui';

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

export function CategoryForm({ onDone }: { onDone: () => void }) {
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
                // Vòng chọn cách ô một khoảng (`ring-offset`) ở cả hai nhóm: dán
                // sát viền ô thì nó lẫn vào chính hình đang chọn.
                className={cn(
                  'rounded-token-sm ring-offset-2 ring-offset-surface transition-shadow',
                  icon === option ? 'ring-2 ring-accent' : 'hover:ring-1 hover:ring-border-strong',
                )}
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
                className={cn(
                  'size-8 rounded-token-sm ring-offset-2 ring-offset-surface transition-shadow',
                  color === option ? 'ring-2 ring-accent' : 'hover:ring-1 hover:ring-border-strong',
                )}
                style={{ backgroundColor: option }}
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
