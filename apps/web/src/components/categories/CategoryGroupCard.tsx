'use client';

import type { CategoryDto } from '@expense/shared';
import { Tag, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Badge, Button, Card, CardHeader, CategoryIcon, EmptyState } from '@/components/ui';

/** Một nhóm danh mục (Chi hoặc Thu) trong một card. */
export function CategoryGroupCard({
  label,
  items,
  ruleCountByCategory,
  onDelete,
  deleting,
}: {
  label: string;
  items: CategoryDto[];
  /** Số rule tự phân loại của từng danh mục, theo id. */
  ruleCountByCategory: Map<string, number>;
  onDelete: (category: CategoryDto) => void;
  /** Đang xoá một danh mục nào đó — khoá nút xoá của cả nhóm. */
  deleting: boolean;
}) {
  return (
    <Card>
      <CardHeader title={label} subtitle={`${items.length} danh mục`} />
      {items.length === 0 ? (
        <EmptyState icon={Tag} title="Chưa có danh mục nào" />
      ) : (
        <ul className="mt-3 divide-y">
          {items.map((category) => {
            const ruleCount = ruleCountByCategory.get(category.id) ?? 0;

            return (
              <li
                key={category.id}
                className="flex items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-surface-hover"
              >
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
                    {ruleCount > 0 && <Badge size="sm">{ruleCount} rule</Badge>}
                  </p>
                </Link>

                <Button
                  variant="danger"
                  size="sm"
                  aria-label={`Xoá ${category.name}`}
                  disabled={deleting}
                  onClick={() => onDelete(category)}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
