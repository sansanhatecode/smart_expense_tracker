'use client';

import { formatVnd, formatVndCompact, type TrendPointDto } from '@expense/shared';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMonthAxis } from '@/lib/utils';

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
          {/*
            `isAnimationActive={false}`: recharts mặc định vẽ đường dần trong
            1,5 giây. Nó chạy bằng JS nên khối @media prefers-reduced-motion
            trong globals.css KHÔNG chặn được — ai bật giảm chuyển động vẫn phải
            xem trọn hiệu ứng đó. Nó cũng chạy lại mỗi lần khung đổi kích thước,
            nên đường có thể đang ở giữa chừng khi người dùng đã đọc số. Đây là
            biểu đồ tiền, hiện ngay là đúng.
          */}
          <Line
            type="monotone"
            dataKey="income"
            name="Thu"
            stroke="var(--series-income)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            isAnimationActive={false}
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
            isAnimationActive={false}
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
    <div className="rounded-token-sm border bg-surface-raised px-3 py-2 text-sm shadow-overlay">
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
