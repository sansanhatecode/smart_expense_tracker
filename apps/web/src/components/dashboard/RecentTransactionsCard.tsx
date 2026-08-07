'use client';

import type { Paginated, TransactionDto } from '@expense/shared';
import { formatVnd } from '@expense/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Card, CardHeader, CategoryIcon, Skeleton } from '@/components/ui';
import { formatDateShort, formatMonth } from '@/lib/utils';
import { SeeAllLink } from './SeeAllLink';

export function RecentTransactionsCard({
  query,
  month,
}: {
  query: UseQueryResult<Paginated<TransactionDto>>;
  /** 'YYYY-MM' của kỳ đang xem. */
  month: string;
}) {
  return (
    <Card>
      <CardHeader
        title="Giao dịch gần đây"
        subtitle={formatMonth(month)}
        action={<SeeAllLink href="/transactions" />}
      />
      <div className="mt-3">
        <QueryBoundary
          query={query}
          skeleton={
            <div className="space-y-3 px-5 pb-5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          }
        >
          {(data) =>
            data.items.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">Chưa có giao dịch nào</p>
            ) : (
              <ul className="divide-y">
                {data.items.map((tx) => (
                  <li
                    key={tx.id}
                    className="flex items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-surface-hover"
                  >
                    <CategoryIcon
                      icon={tx.category?.icon ?? 'CircleHelp'}
                      color={tx.category?.color ?? '#898781'}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{tx.description}</p>
                      <p className="text-sm text-ink-muted">
                        {formatDateShort(tx.date)}
                        {tx.category ? ` · ${tx.category.name}` : ' · Chưa phân loại'}
                        {/* Không im lặng: dòng này hiện số tiền nhưng KHÔNG
                            nằm trong các KPI phía trên. Thấy một khoản 862k
                            mà tổng chi không đổi thì người dùng sẽ nghĩ app
                            tính sai. */}
                        {tx.internalKind && ' · ngoài thống kê'}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-sm font-medium tabular"
                      style={{
                        color: tx.internalKind
                          ? 'var(--ink-muted)'
                          : tx.type === 'income'
                            ? 'var(--series-income)'
                            : 'var(--ink)',
                      }}
                    >
                      {tx.type === 'income' ? '+' : '−'}
                      {formatVnd(tx.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryBoundary>
      </div>
    </Card>
  );
}
