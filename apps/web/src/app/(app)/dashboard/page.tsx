'use client';

import type {
  BudgetAlertDto,
  CategoryBreakdownDto,
  SummaryDto,
  TransactionDto,
  Paginated,
  TrendDto,
} from '@expense/shared';
import { formatVnd } from '@expense/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Upload, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import {
  addMonths,
  currentMonthKey,
  formatDateShort,
  formatMonth,
  monthKeyOptions,
  monthRange,
} from '@/lib/utils';
import {
  BudgetAlertRow,
  CategoryBars,
  StatTile,
  TrendChart,
} from '@/components/charts';
import {
  ButtonLink,
  Card,
  CardHeader,
  CategoryIcon,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
} from '@/components/ui';

/** Số tháng chọn được. 12 đủ để so cùng kỳ năm ngoái mà dropdown vẫn đọc được. */
const MONTH_COUNT = 12;

/** Số điểm của chart xu hướng — đủ để thấy xu hướng, không quá dày để đọc. */
const TREND_MONTHS = 6;

export default function DashboardPage() {
  // Cả trang xoay quanh một tháng: KPI, danh mục, cảnh báo ngân sách và danh
  // sách giao dịch đều đọc từ đây, nên không kỳ nào lệch kỳ nào.
  const [month, setMonth] = useState(currentMonthKey());
  const period = monthRange(month);

  // Chart kết thúc ở tháng đang xem chứ không phải tháng hiện tại — xem lại
  // tháng 3 thì phải thấy đường đi dẫn tới tháng 3.
  const trendFrom = addMonths(month, -(TREND_MONTHS - 1));
  const trend = { from: monthRange(trendFrom).from, to: period.to };

  const summary = useQuery({
    queryKey: ['stats', 'summary', period],
    queryFn: () => api.get<SummaryDto>('/api/stats/summary', period),
  });

  const breakdown = useQuery({
    queryKey: ['stats', 'by-category', period],
    queryFn: () => api.get<CategoryBreakdownDto>('/api/stats/by-category', period),
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
    queryKey: ['transactions', 'recent', period],
    queryFn: () =>
      api.get<Paginated<TransactionDto>>('/api/transactions', {
        ...period,
        limit: 6,
        sort: 'date_desc',
      }),
  });

  const isCurrentMonth = month === currentMonthKey();
  const noData = summary.data?.transactionCount === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Tổng quan</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">{formatMonth(month)}</p>
        </div>
        {/* Ô chọn kỳ nằm NGOÀI nhánh rỗng bên dưới: tháng không có giao dịch vẫn
            phải đổi được kỳ, nếu không người dùng kẹt ở một tháng trống. */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Chọn kỳ"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-44"
          >
            {monthKeyOptions(MONTH_COUNT).map((option) => (
              <option key={option} value={option}>
                {formatMonth(option)}
              </option>
            ))}
          </Select>
          <ButtonLink href="/imports" variant="primary" size="sm">
            <Upload aria-hidden className="size-4" />
            Import sao kê
          </ButtonLink>
        </div>
      </header>

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
          {/* ─── KPI row ─── */}
          <section className="grid gap-4 sm:grid-cols-3">
            {summary.isPending ? (
              <>
                <Skeleton className="h-[7.5rem]" />
                <Skeleton className="h-[7.5rem]" />
                <Skeleton className="h-[7.5rem]" />
              </>
            ) : summary.isError ? (
              <Card className="sm:col-span-3">
                <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
              </Card>
            ) : (
              <>
                <StatTile
                  label="Tổng thu"
                  value={summary.data.income}
                  previous={summary.data.previous.income}
                  tone="income"
                  upIsGood
                />
                <StatTile
                  label="Tổng chi"
                  value={summary.data.expense}
                  previous={summary.data.previous.expense}
                  tone="expense"
                  upIsGood={false}
                />
                <StatTile
                  label="Còn lại"
                  value={summary.data.net}
                  previous={summary.data.previous.net}
                  upIsGood
                />
              </>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            {/* ─── Xu hướng 6 tháng ─── */}
            <Card>
              <CardHeader
                title={`Thu chi ${TREND_MONTHS} tháng`}
                subtitle={`${formatMonth(trendFrom)} – ${formatMonth(month)}`}
              />
              <div className="mt-3">
                {trendData.isPending ? (
                  <Skeleton className="mx-5 mb-5 h-56" />
                ) : trendData.isError ? (
                  <ErrorState error={trendData.error} onRetry={() => void trendData.refetch()} />
                ) : (
                  <TrendChart points={trendData.data.points} />
                )}
              </div>
            </Card>

            {/* ─── Cảnh báo ngân sách ─── */}
            <Card>
              <CardHeader
                title="Ngân sách cần chú ý"
                subtitle={formatMonth(month)}
                action={
                  <Link
                    href="/budgets"
                    className="flex items-center gap-1 text-sm font-medium text-accent"
                  >
                    Tất cả
                    <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                }
              />
              <div className="mt-4 px-5 pb-5">
                {alerts.isPending ? (
                  <div className="space-y-4">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                  </div>
                ) : alerts.isError ? (
                  <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} />
                ) : alerts.data.length === 0 ? (
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
                    {alerts.data.map((alert) => (
                      <BudgetAlertRow key={alert.budgetId} alert={alert} />
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ─── Chi theo danh mục ─── */}
            <Card>
              <CardHeader
                title="Chi theo danh mục"
                subtitle={
                  breakdown.data
                    ? `${breakdown.data.expense.length} danh mục`
                    : undefined
                }
              />
              <div className="mt-3">
                {breakdown.isPending ? (
                  <div className="space-y-3 px-5 pb-5">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12" />
                    ))}
                  </div>
                ) : breakdown.isError ? (
                  <ErrorState error={breakdown.error} onRetry={() => void breakdown.refetch()} />
                ) : (
                  <CategoryBars
                    items={breakdown.data.expense}
                    emptyLabel={`Chưa có khoản chi nào trong ${formatMonth(month).toLowerCase()}`}
                  />
                )}
              </div>
            </Card>

            {/* ─── Giao dịch gần đây ─── */}
            <Card>
              <CardHeader
                title="Giao dịch gần đây"
                subtitle={formatMonth(month)}
                action={
                  <Link
                    href="/transactions"
                    className="flex items-center gap-1 text-sm font-medium text-accent"
                  >
                    Tất cả
                    <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                }
              />
              <div className="mt-3">
                {recent.isPending ? (
                  <div className="space-y-3 px-5 pb-5">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12" />
                    ))}
                  </div>
                ) : recent.isError ? (
                  <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
                ) : recent.data.items.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-ink-muted">
                    Chưa có giao dịch nào
                  </p>
                ) : (
                  <ul className="divide-y">
                    {recent.data.items.map((tx) => (
                      <li key={tx.id} className="flex items-center gap-3 px-5 py-3">
                        <CategoryIcon
                          icon={tx.category?.icon ?? 'CircleHelp'}
                          color={tx.category?.color ?? '#898781'}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            {tx.description}
                          </p>
                          <p className="text-sm text-ink-muted">
                            {formatDateShort(tx.date)}
                            {tx.category ? ` · ${tx.category.name}` : ' · Chưa phân loại'}
                          </p>
                        </div>
                        <span
                          className="shrink-0 text-sm font-medium tabular"
                          style={{
                            color:
                              tx.type === 'income'
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
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
