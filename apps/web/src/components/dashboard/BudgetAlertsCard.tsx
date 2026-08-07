'use client';

import type { BudgetAlertDto } from '@expense/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { BudgetAlertRow } from '@/components/charts';
import { QueryBoundary } from '@/components/QueryBoundary';
import { ButtonLink, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui';
import { formatMonth } from '@/lib/utils';
import { SeeAllLink } from './SeeAllLink';

export function BudgetAlertsCard({
  query,
  month,
}: {
  query: UseQueryResult<BudgetAlertDto[]>;
  /** 'YYYY-MM' của kỳ đang xem. */
  month: string;
}) {
  return (
    <Card>
      <CardHeader
        title="Ngân sách cần chú ý"
        subtitle={formatMonth(month)}
        action={<SeeAllLink href="/budgets" />}
      />
      <div className="mt-4 px-5 pb-5">
        <QueryBoundary
          query={query}
          skeleton={
            <div className="space-y-4">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          }
        >
          {(alerts) =>
            alerts.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Chưa có ngân sách nào vượt ngưỡng"
                description="Đặt ngân sách theo danh mục để được cảnh báo khi chi quá tay."
                action={
                  <ButtonLink href="/budgets" size="sm">
                    Đặt ngân sách
                  </ButtonLink>
                }
              />
            ) : (
              <div className="space-y-5">
                {alerts.map((alert) => (
                  <BudgetAlertRow key={alert.budgetId} alert={alert} />
                ))}
              </div>
            )
          }
        </QueryBoundary>
      </div>
    </Card>
  );
}
