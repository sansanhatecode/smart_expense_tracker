'use client';

import { formatVnd, formatVndCompact, type BudgetAlertDto, type CategoryBreakdownItemDto, type TrendPointDto } from '@expense/shared';
import { TrendingDown, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn, formatMonthAxis, percentChange } from '@/lib/utils';
import { CategoryIcon, StatusBadge } from './ui';

/**
 * Biểu đồ.
 *
 * Quy tắc màu, hình dạng mark, và cách chọn form đều theo một bộ nguyên tắc
 * data-viz, và bảng màu đã qua validator (xem globals.css). Ba điểm đáng nhắc:
 *
 *   Thu = xanh, Chi = cam. Cố tình KHÔNG dùng đỏ/xanh-lá — đó đúng là trục mà
 *   dạng mù màu phổ biến nhất không đọc được. Cặp xanh/cam đạt CVD ΔE 24.7.
 *
 *   Breakdown theo danh mục là BAR NGANG một màu, không phải biểu đồ tròn. Với
 *   11 danh mục thì tròn không đọc được, và không tồn tại 11 màu phân biệt được.
 *   Tên danh mục trên trục mang identity, độ dài bar mang độ lớn.
 *
 *   Trạng thái luôn kèm icon + chữ, không bao giờ chỉ có màu.
 */

// ─── Stat tile ───────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  previous,
  tone = 'neutral',
  /** true khi tăng là điều tốt (thu), false khi tăng là điều xấu (chi). */
  upIsGood,
}: {
  label: string;
  value: number;
  previous?: number;
  tone?: 'income' | 'expense' | 'neutral';
  upIsGood?: boolean;
}) {
  const change = previous === undefined ? null : percentChange(value, previous);

  const valueColor =
    tone === 'income'
      ? 'var(--series-income)'
      : tone === 'expense'
        ? 'var(--series-expense)'
        : value < 0
          ? 'var(--delta-bad)'
          : 'var(--ink)';

  return (
    <div className="border bg-surface p-4" style={{ borderRadius: 'var(--radius)' }}>
      <p className="text-sm text-ink-secondary">{label}</p>
      {/*
        Số lớn dùng figure tỷ lệ (không tabular-nums): tabular cho mọi chữ số bề
        rộng của '0' nên ở cỡ lớn số trông rời rạc.
      */}
      <p className="mt-1.5 text-2xl font-semibold tracking-tight" style={{ color: valueColor }}>
        {formatVnd(value)}
      </p>
      {change !== null && upIsGood !== undefined && (
        <DeltaLabel change={change} upIsGood={upIsGood} />
      )}
      {change === null && previous !== undefined && (
        <p className="mt-1.5 text-sm text-ink-muted">Kỳ trước không có dữ liệu</p>
      )}
    </div>
  );
}

function DeltaLabel({ change, upIsGood }: { change: number; upIsGood: boolean }) {
  const up = change >= 0;
  const good = up === upIsGood;
  const Icon = up ? TrendingUp : TrendingDown;

  return (
    <p
      className="mt-1.5 flex items-center gap-1.5 text-sm font-medium"
      style={{ color: good ? 'var(--delta-good)' : 'var(--delta-bad)' }}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {up ? '+' : ''}
      {change.toFixed(1)}%
      <span className="font-normal text-ink-muted">so với kỳ trước</span>
    </p>
  );
}

// ─── Trend: 2 series theo thời gian ──────────────────────────────────────────

export function TrendChart({ points }: { points: TrendPointDto[] }) {
  const data = points.map((point) => ({
    ...point,
    label: point.period.length === 7 ? formatMonthAxis(point.period) : point.period.slice(8),
  }));

  return (
    <div className="px-2 pb-2">
      {/* Legend luôn có với ≥2 series — identity không bao giờ chỉ dựa vào màu */}
      <div className="mb-2 flex items-center gap-4 px-3 text-sm">
        <LegendKey color="var(--series-income)" label="Thu" />
        <LegendKey color="var(--series-expense)" label="Chi" />
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          {/* Gridline hairline, chỉ ngang, recessive — không kẻ dọc để bớt mực */}
          <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--axis)"
            tick={{ fill: 'var(--ink-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--axis)' }}
          />
          <YAxis
            stroke="var(--axis)"
            tick={{ fill: 'var(--ink-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value: number) => formatVndCompact(value)}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="income"
            name="Thu"
            stroke="var(--series-income)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            // Marker ≥8px với ring màu nền để còn đọc được khi hai đường chồng nhau
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
          />
          <Line
            type="monotone"
            dataKey="expense"
            name="Chi"
            stroke="var(--series-expense)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-ink-secondary">
      {/* Dấu hiệu màu nằm CẠNH chữ, chữ không bao giờ mang màu series */}
      <span
        aria-hidden
        className="inline-block h-0.5 w-4 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

interface TooltipPayloadItem {
  name?: string;
  value?: number;
  dataKey?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const income = payload.find((item) => item.dataKey === 'income')?.value ?? 0;
  const expense = payload.find((item) => item.dataKey === 'expense')?.value ?? 0;

  return (
    <div
      className="border bg-surface-raised px-3 py-2 text-sm shadow-lg"
      style={{ borderRadius: 'var(--radius-sm)' }}
    >
      <p className="mb-1.5 font-medium text-ink">{label}</p>
      <dl className="space-y-1 tabular">
        <TooltipRow color="var(--series-income)" label="Thu" value={income} />
        <TooltipRow color="var(--series-expense)" label="Chi" value={expense} />
        <div className="flex items-center justify-between gap-6 border-t pt-1">
          <dt className="text-ink-secondary">Còn lại</dt>
          <dd
            className="font-medium"
            style={{ color: income - expense < 0 ? 'var(--delta-bad)' : 'var(--ink)' }}
          >
            {formatVnd(income - expense)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function TooltipRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <dt className="flex items-center gap-1.5 text-ink-secondary">
        <span
          aria-hidden
          className="inline-block size-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label}
      </dt>
      <dd className="font-medium text-ink">{formatVnd(value)}</dd>
    </div>
  );
}

// ─── Breakdown theo danh mục: bar ngang, một màu ─────────────────────────────

export function CategoryBars({
  items,
  emptyLabel,
}: {
  items: CategoryBreakdownItemDto[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-ink-muted">{emptyLabel}</p>;
  }

  const max = Math.max(...items.map((item) => item.total));

  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.categoryId ?? 'uncategorized'} className="px-5 py-3">
          <div className="flex items-center gap-3">
            <CategoryIcon icon={item.icon} color={item.color} />

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-ink">{item.name}</span>
                {/* Giá trị hiển thị đầy đủ, không rút gọn — đây là số tiền của người dùng */}
                <span className="shrink-0 text-sm font-medium text-ink tabular">
                  {formatVnd(item.total)}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                {/* Track là bước nhạt của cùng hue, không phải xám — trạng thái đọc
                    được trên toàn bộ chiều dài bar */}
                <div
                  className="h-1.5 flex-1 overflow-hidden bg-bar-track"
                  style={{ borderRadius: '9999px' }}
                >
                  <div
                    className="h-full bg-bar"
                    style={{
                      width: `${(item.total / max) * 100}%`,
                      borderRadius: '9999px',
                    }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-sm text-ink-muted tabular">
                  {(item.share * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Ngân sách: meter ────────────────────────────────────────────────────────

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
          className="h-2 flex-1 overflow-hidden"
          style={{ backgroundColor: 'var(--grid)', borderRadius: '9999px' }}
        >
          <div
            className="h-full"
            style={{
              // Kẹp thanh ở 100% để nó không tràn khỏi track, nhưng con số bên
              // dưới vẫn nói đúng đã vượt bao nhiêu.
              width: `${Math.min(ratio, 1) * 100}%`,
              backgroundColor: fillColor,
              borderRadius: '9999px',
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

export { cn };
