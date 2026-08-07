'use client';

import type { CategoryDto, StagedRowDto } from '@expense/shared';
import { formatVnd } from '@expense/shared';
import { Badge, Card, CardHeader, CategoryIcon, Select, StatusBadge } from '@/components/ui';
import { formatDate } from '@/lib/utils';

/**
 * Các dòng đọc được từ file, còn sửa được trước khi ghi vào dữ liệu.
 *
 * Mọi thay đổi đi thẳng lên staging qua `onUpdate` chứ không giữ state ở đây:
 * bảng đếm phía trên ("sẽ thêm N giao dịch") đọc từ chính staging đó, nên bỏ
 * tick một dòng phải làm con số kia đổi theo ngay.
 */
export function StagedRowsCard({
  rows,
  categories,
  onUpdate,
}: {
  rows: StagedRowDto[];
  categories: CategoryDto[];
  onUpdate: (rowId: string, patch: Record<string, unknown>) => void;
}) {
  return (
    <Card>
      <CardHeader title="Các dòng trong file" subtitle="Bỏ tick dòng không muốn thêm" />
      <ul className="mt-3 divide-y">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`flex flex-wrap items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-hover sm:px-5 ${
              row.selected ? '' : 'opacity-55'
            }`}
          >
            <input
              type="checkbox"
              checked={row.selected}
              aria-label={`Thêm ${row.description}`}
              className="accent-accent size-4 shrink-0"
              onChange={(e) => onUpdate(row.id, { selected: e.target.checked })}
            />

            <CategoryIcon
              icon={row.category?.icon ?? 'CircleHelp'}
              color={row.category?.color ?? '#898781'}
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{row.description}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <span className="tabular">{formatDate(row.date)}</span>
                {row.duplicate === 'in_db' && (
                  <StatusBadge status="warning">Đã có trong dữ liệu</StatusBadge>
                )}
                {!row.category && <Badge size="sm">chưa phân loại</Badge>}
              </p>
            </div>

            <Select
              aria-label={`Danh mục của ${row.description}`}
              value={row.category?.id ?? ''}
              className="h-8 w-full text-sm sm:w-44"
              onChange={(e) =>
                onUpdate(row.id, { categoryId: e.target.value === '' ? null : e.target.value })
              }
            >
              <option value="">Chưa phân loại</option>
              {categories
                .filter((category) => category.type === row.type)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </Select>

            <span
              className="w-32 shrink-0 text-right text-sm font-medium tabular"
              style={{
                color: row.type === 'income' ? 'var(--series-income)' : 'var(--ink)',
              }}
            >
              {row.type === 'income' ? '+' : '−'}
              {formatVnd(row.amount)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
