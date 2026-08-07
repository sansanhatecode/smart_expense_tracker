'use client';

import type {
  AccountBreakdownDto,
  AccountDto,
  BudgetAlertDto,
  CategoryBreakdownDto,
  SummaryDto,
  TransactionDto,
  Paginated,
  TrendDto,
} from '@expense/shared';
import { useQuery } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { addMonths, currentMonthKey, formatMonth, monthRange } from '@/lib/utils';
import {
  AccountBreakdownCard,
  CategoryBreakdownCard,
} from '@/components/dashboard/BreakdownCards';
import { BudgetAlertsCard } from '@/components/dashboard/BudgetAlertsCard';
import { PeriodControls } from '@/components/dashboard/PeriodControls';
import { RecentTransactionsCard } from '@/components/dashboard/RecentTransactionsCard';
import { InternalTransfersNote, SummaryTiles } from '@/components/dashboard/SummaryTiles';
import { TrendCard } from '@/components/dashboard/TrendCard';
import { ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';

/** Số tháng chọn được. 12 đủ để so cùng kỳ năm ngoái mà dropdown vẫn đọc được. */
const MONTH_COUNT = 12;

/** Số điểm của chart xu hướng — đủ để thấy xu hướng, không quá dày để đọc. */
const TREND_MONTHS = 6;

export default function DashboardPage() {
  // Cả trang xoay quanh một tháng và một nguồn tiền: KPI, danh mục, cảnh báo
  // ngân sách và danh sách giao dịch đều đọc từ đây, nên không kỳ nào lệch kỳ nào.
  const [month, setMonth] = useState(currentMonthKey());
  const [accountId, setAccountId] = useState('');
  const period = monthRange(month);

  // Bộ tham số chung cho mọi query thống kê. Nó cũng là queryKey, nên đổi nguồn
  // tiền là tự refetch — không cần nhớ thêm accountId vào từng key một.
  const statsParams = { ...period, ...(accountId ? { accountId } : {}) };

  // Chart kết thúc ở tháng đang xem chứ không phải tháng hiện tại — xem lại
  // tháng 3 thì phải thấy đường đi dẫn tới tháng 3.
  const trendFrom = addMonths(month, -(TREND_MONTHS - 1));
  const trend = {
    from: monthRange(trendFrom).from,
    to: period.to,
    ...(accountId ? { accountId } : {}),
  };

  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<AccountDto[]>('/api/accounts'),
  });

  const summary = useQuery({
    queryKey: ['stats', 'summary', statsParams],
    queryFn: () => api.get<SummaryDto>('/api/stats/summary', statsParams),
  });

  const breakdown = useQuery({
    queryKey: ['stats', 'by-category', statsParams],
    queryFn: () => api.get<CategoryBreakdownDto>('/api/stats/by-category', statsParams),
  });

  const byAccount = useQuery({
    queryKey: ['stats', 'by-account', statsParams],
    queryFn: () => api.get<AccountBreakdownDto>('/api/stats/by-account', statsParams),
  });

  const trendData = useQuery({
    queryKey: ['stats', 'trend', trend],
    queryFn: () =>
      api.get<TrendDto>('/api/stats/trend', { ...trend, granularity: 'month' }),
  });

  const alerts = useQuery({
    queryKey: ['budgets', 'alerts', month],
    queryFn: () => api.get<BudgetAlertDto[]>('/api/budgets/alerts', { month }),
  });

  const recent = useQuery({
    queryKey: ['transactions', 'recent', statsParams],
    queryFn: () =>
      api.get<Paginated<TransactionDto>>('/api/transactions', {
        ...statsParams,
        limit: 6,
        sort: 'date_desc',
      }),
  });

  /**
   * Link từ một ô KPI sang danh sách giao dịch đứng sau con số đó.
   *
   * Luôn mang theo kỳ và nguồn tiền đang xem — thiếu chúng thì danh sách trả về
   * một tập khác hẳn và người dùng bấm vào con số 55 triệu để thấy tổng khác.
   * Phần `params` là điều kiện riêng của từng ô, xem từng chỗ gọi.
   */
  const txLink = (params: Record<string, string>) =>
    `/transactions?${new URLSearchParams({
      ...period,
      ...(accountId ? { accountId } : {}),
      ...params,
    }).toString()}`;

  const isCurrentMonth = month === currentMonthKey();
  const noData = summary.data?.transactionCount === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan"
        subtitle={formatMonth(month)}
        actions={
          <PeriodControls
            accounts={accounts.data ?? []}
            accountId={accountId}
            onAccountChange={setAccountId}
            month={month}
            onMonthChange={setMonth}
            monthCount={MONTH_COUNT}
          />
        }
      />

      {noData ? (
        <Card>
          <EmptyState
            icon={Upload}
            title={`Chưa có giao dịch nào trong ${formatMonth(month).toLowerCase()}`}
            description={
              isCurrentMonth
                ? 'Import một file sao kê ngân hàng, hoặc chạy npm run db:seed để xem dashboard với dữ liệu mẫu.'
                : 'Chọn kỳ khác ở phía trên, hoặc import sao kê của tháng này.'
            }
            action={
              <ButtonLink href="/imports" variant="primary" size="sm">
                Import sao kê
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <>
          <SummaryTiles query={summary} txLink={txLink} />

          <InternalTransfersNote internal={summary.data?.internal} period={period} />

          {/*
            `items-start` để mỗi card cao bằng đúng nội dung của nó.
            Mặc định grid kéo cả hàng cao bằng card cao nhất, và ở đây card cảnh
            báo ngân sách có thể dài gấp đôi chart — kết quả là một vùng trống
            bằng nửa card, trông như dữ liệu bị thiếu chứ không như bố cục.
          */}
          <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
            <TrendCard query={trendData} months={TREND_MONTHS} from={trendFrom} to={month} />
            <BudgetAlertsCard query={alerts} month={month} />
          </div>

          {/* `items-start` cùng lý do như hàng trên: một người chỉ có một nguồn
              tiền thì card bên phải đúng một dòng, trong khi card bên trái có cả
              chục danh mục. */}
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <CategoryBreakdownCard query={breakdown} month={month} txLink={txLink} />
            <AccountBreakdownCard query={byAccount} txLink={txLink} />
          </div>

          <RecentTransactionsCard query={recent} month={month} />
        </>
      )}
    </div>
  );
}
