'use client';

import type { AccountDto, CategoryDto } from '@expense/shared';
import { expandInternalFilter } from '@expense/shared';
import { Search } from 'lucide-react';
import { Card, Field, Input, MultiSelect, Select, type MultiSelectOption } from '@/components/ui';
import { INTERNAL_OPTIONS, NONE, TYPE_OPTIONS, type Filters } from './filters';

/**
 * Hàng bộ lọc phía trên bảng, cộng các câu giải thích đi kèm một số lựa chọn.
 *
 * Không giữ state: mọi thay đổi đi lên `onChange` để trang là chỗ duy nhất biết
 * bộ lọc hiện tại — cũng là chỗ duy nhất xoá lựa chọn và về trang 1.
 */
export function TransactionFilters({
  filters,
  categories,
  accounts,
  onChange,
}: {
  filters: Filters;
  categories: CategoryDto[];
  accounts: AccountDto[];
  onChange: (patch: Partial<Filters>) => void;
}) {
  // Mục "không có" đứng đầu danh sách: sau import luôn còn một mớ chưa phân loại,
  // và nó là thứ người dùng tìm nhiều nhất ở đây.
  const categoryOptions: MultiSelectOption[] = [
    { value: NONE, label: 'Chưa phân loại' },
    ...categories.map((category) => ({
      value: category.id,
      // Mũi tên phân biệt danh mục thu với danh mục chi cùng tên.
      label: `${category.type === 'income' ? '↑' : '↓'} ${category.name}`,
    })),
  ];

  const accountOptions: MultiSelectOption[] = [
    { value: NONE, label: 'Không rõ nguồn' },
    ...accounts.map((account) => ({ value: account.id, label: account.name })),
  ];

  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Field label="Từ ngày">
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => onChange({ from: e.target.value })}
          />
        </Field>
        <Field label="Đến ngày">
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => onChange({ to: e.target.value })}
          />
        </Field>
        <Field label="Loại">
          <Select
            value={filters.cashflow === 'out' ? 'cash_out' : filters.type}
            onChange={(e) => {
              const option = TYPE_OPTIONS.find((item) => item.value === e.target.value);
              if (option) onChange(option.patch);
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
            onChange={(categoryIds) => onChange({ categoryIds })}
          />
        </Field>
        <Field label="Nguồn tiền" as="div">
          <MultiSelect
            label="Lọc theo nguồn tiền"
            options={accountOptions}
            selected={filters.accountIds}
            onChange={(accountIds) => onChange({ accountIds })}
          />
        </Field>
        <Field label="Khoản nội bộ" as="div">
          <MultiSelect
            label="Lọc theo khoản nội bộ"
            options={INTERNAL_OPTIONS}
            selected={filters.internal}
            // Panel chỉ trả về giá trị từ INTERNAL_OPTIONS, nhưng vẫn lọc qua
            // expandInternalFilter để state không thể nhận giá trị lạ.
            onChange={(values) => onChange({ internal: expandInternalFilter(values) })}
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
              onChange={(e) => onChange({ q: e.target.value })}
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
  );
}
