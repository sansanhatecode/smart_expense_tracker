'use client';

import type { BudgetDto } from '@expense/shared';
import { Trash2 } from 'lucide-react';
import { BudgetMeter } from '@/components/charts';
import { Button } from '@/components/ui';

/** Danh sách ngân sách của kỳ: mỗi dòng một thanh đo mức chi và nút xoá. */
export function BudgetList({
  budgets,
  onDelete,
  deleting,
}: {
  budgets: BudgetDto[];
  onDelete: (budget: BudgetDto) => void;
  /** Đang xoá một ngân sách nào đó — khoá nút xoá của cả danh sách. */
  deleting: boolean;
}) {
  return (
    <ul className="space-y-6">
      {budgets.map((budget) => (
        <li key={budget.id} className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <BudgetMeter
              name={budget.category.name}
              icon={budget.category.icon}
              color={budget.category.color}
              spent={budget.spent}
              limit={budget.limitAmount}
              status={budget.status}
            />
          </div>
          <Button
            variant="danger"
            size="sm"
            aria-label={`Xoá ngân sách ${budget.category.name}`}
            disabled={deleting}
            onClick={() => onDelete(budget)}
          >
            <Trash2 aria-hidden className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
