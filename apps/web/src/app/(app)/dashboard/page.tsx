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
import { formatVnd } from '@expense/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Shuffle, Upload, Wallet } from 'lucide-react';
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
  accountBar,
  BreakdownBars,
  BudgetAlertRow,
  categoryBar,
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
  // Một nguồn tiền thì không có gì để lọc — dropdown chỉ thêm nhiễu.
  const canFilterByAccount = (accounts.data?.length ?? 0) > 1;

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
          {canFilterByAccount && (
            <Select
              aria-label="Lọc theo nguồn tiền"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-48"
            >
              <option value="">Tất cả nguồn tiền</option>
              {accounts.data?.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          )}
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
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summary.isPending ? (
              <>
                <Skeleton className="h-[7.5rem]" />
                <Skeleton className="h-[7.5rem]" />
                <Skeleton className="h-[7.5rem]" />
                <Skeleton className="h-[7.5rem]" />
              </>
            ) : summary.isError ? (
              <Card className="sm:col-span-2 xl:col-span-4">
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
                  hint="Tiền vào các nguồn của bạn trong kỳ. Không tính tiền bạn chuyển giữa hai nguồn của chính mình — đó không phải thu nhập."
                  href={txLink({ type: 'income', internal: 'exclude' })}
                />
                <StatTile
                  label="Chi tiêu"
                  value={summary.data.expense}
                  previous={summary.data.previous.expense}
                  tone="expense"
                  upIsGood={false}
                  hint="Chi tiêu thật, tính theo ngày phát sinh: quẹt thẻ tín dụng được tính ngay tại ngày mua, kể cả khi tháng sau mới trả. Không gồm khoản chuyển nội bộ."
                  href={txLink({ type: 'expense', internal: 'exclude' })}
                />
                {/*
                  Hai con số chi cạnh nhau là có chủ ý, không phải trùng lặp:
                  "Chi tiêu" tính khoản quẹt thẻ ngay tại ngày mua, còn "Tiền đã
                  ra" chỉ đếm lúc tiền thật sự rời tài khoản. Tháng tiêu nhiều
                  bằng thẻ thì hai số lệch nhau, và đó chính là thông tin.

                  Link của ô này KHÔNG mang internal=exclude như ba ô kia: khoản
                  trả sao kê thẻ là khoản nội bộ nhưng lại nằm TRONG con số này.
                  `cashflow=out` mang đúng định nghĩa đó sang danh sách.
                */}
                <StatTile
                  label="Tiền đã ra"
                  value={summary.data.cashOutflow}
                  hint="Tiền thật sự rời khỏi các nguồn của bạn: chi bằng tiền mặt, tài khoản, ví — cộng số đã trả sao kê thẻ trong kỳ. Khoản quẹt thẻ chưa tới hạn trả không tính ở đây, nên số này lệch với Chi tiêu là bình thường."
                  href={txLink({ cashflow: 'out' })}
                />
                <StatTile
                  label="Còn lại"
                  value={summary.data.net}
                  previous={summary.data.previous.net}
                  upIsGood
                  hint="Tổng thu trừ Chi tiêu của kỳ này. Số âm nghĩa là kỳ này tiêu nhiều hơn thu — không phải số dư còn lại trong tài khoản."
                  href={txLink({ internal: 'exclude' })}
                />
              </>
            )}
          </section>

          {/*
            Nói rõ đã loại gì khỏi các con số trên. Giấu tiền đi mà không nói là
            cách nhanh nhất khiến người dùng mất tin — nhất là khi nhận diện có
            thể sai và họ là người duy nhất biết điều đó.
          */}
          {summary.data && summary.data.internal.count > 0 && (
            <Link
              // Mang theo kỳ đang xem: không có nó thì link nhảy sang tháng hiện
              // tại và người dùng thấy danh sách rỗng ngay sau khi vừa đọc "đã
              // loại 4 khoản" — trông như link hỏng.
              href={`/transactions?internal=only&from=${period.from}&to=${period.to}`}
              className="flex items-center gap-2 text-sm text-ink-secondary hover:text-ink"
            >
              <Shuffle aria-hidden className="size-4 shrink-0 text-ink-muted" />
              Đã loại {summary.data.internal.count} khoản chuyển tiền nội bộ (
              {formatVnd(summary.data.internal.total)}) khỏi thống kê
              <ArrowRight aria-hidden className="size-3.5 shrink-0" />
            </Link>
          )}

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
                  <BreakdownBars
                    items={breakdown.data.expense.map((item) =>
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
              </div>
            </Card>

            {/* ─── Chi theo nguồn tiền ─── */}
            <Card>
              <CardHeader
                title="Chi theo nguồn tiền"
                subtitle="Tổng khớp với Chi tiêu ở trên"
              />
              <div className="mt-3">
                {byAccount.isPending ? (
                  <div className="space-y-3 px-5 pb-5">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-12" />
                    ))}
                  </div>
                ) : byAccount.isError ? (
                  <ErrorState error={byAccount.error} onRetry={() => void byAccount.refetch()} />
                ) : (
                  <BreakdownBars
                    items={byAccount.data.expense.map((item) =>
                      accountBar(
                        item,
                        // "Không rõ nguồn" (nhập tay, `accountId` null) KHÔNG có
                        // link: không tồn tại filter "giao dịch không gắn nguồn",
                        // nên link duy nhất dựng được sẽ ra một danh sách khác.
                        item.accountId
                          ? txLink({
                              type: 'expense',
                              internal: 'exclude',
                              accountId: item.accountId,
                            })
                          : null,
                      ),
                    )}
                    emptyLabel="Import sao kê để thấy chi tiêu tách theo thẻ, tài khoản và ví"
                  />
                )}
              </div>
            </Card>
          </div>

          <div className="grid gap-6">
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
                            color:
                              tx.internalKind
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
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
