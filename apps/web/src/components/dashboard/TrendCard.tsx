'use client';

import type { TrendDto } from '@expense/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import { TrendChart } from '@/components/charts';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Card, CardHeader, Skeleton } from '@/components/ui';
import { formatMonth } from '@/lib/utils';

export function TrendCard({
  query,
  months,
  from,
  to,
}: {
  query: UseQueryResult<TrendDto>;
  /** Số tháng của chart — cũng là con số trong tiêu đề. */
  months: number;
  /** 'YYYY-MM' đầu và cuối của chart. Cuối là tháng đang xem, không phải tháng hiện tại. */
  from: string;
  to: string;
}) {
  return (
    <Card>
      <CardHeader
        title={`Thu chi ${months} tháng`}
        subtitle={`${formatMonth(from)} – ${formatMonth(to)}`}
      />
      <div className="mt-3">
        <QueryBoundary query={query} skeleton={<Skeleton className="mx-5 mb-5 h-56" />}>
          {(data) => <TrendChart points={data.points} />}
        </QueryBoundary>
      </div>
    </Card>
  );
}
