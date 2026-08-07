'use client';

import type { AccountBreakdownDto, CategoryBreakdownDto } from '@expense/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import { accountBar, BreakdownBars, categoryBar } from '@/components/charts';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Card, CardHeader, Skeleton } from '@/components/ui';
import { formatMonth } from '@/lib/utils';
import type { TxLink } from './SummaryTiles';

/** Khối chờ dùng chung cho hai card breakdown — cùng hình dạng vài dòng bar. */
function BarsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 px-5 pb-5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}

export function CategoryBreakdownCard({
  query,
  month,
  txLink,
}: {
  query: UseQueryResult<CategoryBreakdownDto>;
  month: string;
  txLink: TxLink;
}) {
  return (
    <Card>
      <CardHeader
        title="Chi theo danh mục"
        subtitle={query.data ? `${query.data.expense.length} danh mục` : undefined}
      />
      <div className="mt-3">
        <QueryBoundary query={query} skeleton={<BarsSkeleton rows={4} />}>
          {(data) => (
            <BreakdownBars
              items={data.expense.map((item) =>
                categoryBar(
                  item,
                  // Mục gộp "Chưa phân loại" (`categoryId` null) đi bằng
                  // `uncategorized`, không phải `categoryId=null` — nếu
                  // không thì nó rơi về "tất cả danh mục".
                  txLink({
                    type: 'expense',
                    internal: 'exclude',
                    ...(item.categoryId
                      ? { categoryId: item.categoryId }
                      : { uncategorized: 'true' }),
                  }),
                ),
              )}
              emptyLabel={`Chưa có khoản chi nào trong ${formatMonth(month).toLowerCase()}`}
            />
          )}
        </QueryBoundary>
      </div>
    </Card>
  );
}

export function AccountBreakdownCard({
  query,
  txLink,
}: {
  query: UseQueryResult<AccountBreakdownDto>;
  txLink: TxLink;
}) {
  return (
    <Card>
      <CardHeader title="Chi theo nguồn tiền" subtitle="Tổng khớp với Chi tiêu ở trên" />
      <div className="mt-3">
        <QueryBoundary query={query} skeleton={<BarsSkeleton rows={3} />}>
          {(data) => (
            <BreakdownBars
              items={data.expense.map((item) =>
                accountBar(
                  item,
                  // "Không rõ nguồn" (nhập tay, `accountId` null) đi bằng
                  // `noAccount` — không phải một id nên không nhét vào
                  // `accountId` được.
                  txLink({
                    type: 'expense',
                    internal: 'exclude',
                    ...(item.accountId
                      ? { accountId: item.accountId }
                      : { noAccount: 'true' }),
                  }),
                ),
              )}
              emptyLabel="Import sao kê để thấy chi tiêu tách theo thẻ, tài khoản và ví"
            />
          )}
        </QueryBoundary>
      </div>
    </Card>
  );
}
