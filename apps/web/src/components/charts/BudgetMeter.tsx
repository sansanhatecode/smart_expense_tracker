'use client';

import { formatVnd, type BudgetAlertDto } from '@expense/shared';
import { CategoryIcon, StatusBadge } from '@/components/ui';

export function BudgetMeter({
  name,
  icon,
  color,
  spent,
  limit,
  status,
}: {
  name: string;
  icon: string;
  color: string;
  spent: number;
  limit: number;
  status: 'ok' | 'warning' | 'over';
}) {
  const ratio = limit > 0 ? spent / limit : 0;
  const remaining = limit - spent;

  const fillColor = {
    ok: 'var(--status-good)',
    warning: 'var(--status-warning)',
    over: 'var(--status-critical)',
  }[status];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={icon} color={color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium text-ink">{name}</span>
            <span className="shrink-0 text-sm text-ink-secondary tabular">
              {formatVnd(spent)} / {formatVnd(limit)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--grid)' }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              // Kẹp thanh ở 100% để nó không tràn khỏi track, nhưng con số bên
              // dưới vẫn nói đúng đã vượt bao nhiêu.
              width: `${Math.min(ratio, 1) * 100}%`,
              backgroundColor: fillColor,
            }}
          />
        </div>
        <span className="w-12 shrink-0 text-right text-sm font-medium text-ink tabular">
          {Math.round(ratio * 100)}%
        </span>
      </div>

      <StatusBadge status={status === 'ok' ? 'good' : status === 'warning' ? 'warning' : 'critical'}>
        {status === 'over'
          ? `Vượt ${formatVnd(-remaining)}`
          : `Còn ${formatVnd(remaining)}`}
      </StatusBadge>
    </div>
  );
}

export function BudgetAlertRow({ alert }: { alert: BudgetAlertDto }) {
  return (
    <BudgetMeter
      name={alert.categoryName}
      icon={alert.categoryIcon}
      color={alert.categoryColor}
      spent={alert.spent}
      limit={alert.limitAmount}
      status={alert.status}
    />
  );
}
