'use client';

import { formatVnd } from '@expense/shared';
import { ArrowUpRight, Info, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import { cn, percentChange } from '@/lib/utils';

/**
 * Một con số KPI.
 *
 * `hint` là chú thích "con số này đếm những gì" — bốn ô KPI cạnh nhau đều là
 * tiền và trông như bốn cách cộng cùng một tập giao dịch, trong khi thật ra mỗi
 * ô loại một nhóm khác nhau. Không nói ra thì người dùng tự đoán, và đoán sai
 * thì họ kết luận app tính sai.
 *
 * `href` trỏ sang danh sách giao dịch đã lọc đúng nhóm đứng sau con số. Chỉ
 * truyền khi bộ lọc đó cho ra ĐÚNG tập giao dịch đã cộng thành số này — link ra
 * một danh sách gần đúng thì tệ hơn không có link.
 */
export function StatTile({
  label,
  value,
  previous,
  tone = 'neutral',
  /** true khi tăng là điều tốt (thu), false khi tăng là điều xấu (chi). */
  upIsGood,
  hint,
  href,
}: {
  label: string;
  value: number;
  previous?: number;
  tone?: 'income' | 'expense' | 'neutral';
  upIsGood?: boolean;
  hint?: string;
  href?: string;
}) {
  const hintId = useId();
  const change = previous === undefined ? null : percentChange(value, previous);

  const valueColor =
    tone === 'income'
      ? 'var(--series-income)'
      : tone === 'expense'
        ? 'var(--series-expense)'
        : value < 0
          ? 'var(--delta-bad)'
          : 'var(--ink)';

  const body = (
    <>
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink-secondary">
        {label}
        {hint && <Info aria-hidden className="size-3.5 shrink-0 text-ink-muted" />}
        {href && (
          <ArrowUpRight
            aria-hidden
            className="ml-auto size-4 shrink-0 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          />
        )}
      </p>
      {/*
        Số lớn dùng figure tỷ lệ (không tabular-nums): tabular cho mọi chữ số bề
        rộng của '0' nên ở cỡ lớn số trông rời rạc.
      */}
      <p className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: valueColor }}>
        {formatVnd(value)}
      </p>
      {change !== null && upIsGood !== undefined && (
        <DeltaLabel change={change} upIsGood={upIsGood} />
      )}
      {change === null && previous !== undefined && (
        <p className="mt-1.5 text-sm text-ink-muted">Kỳ trước không có dữ liệu</p>
      )}
    </>
  );

  /**
   * Ô link nhấc lên khi hover (bóng dày hơn + viền đậm hơn), ô không link thì
   * đứng yên: chuyển động ở đây mang nghĩa "bấm được", nên ô nào không bấm được
   * mà cũng nhúc nhích là nói dối.
   */
  const shell = 'block h-full rounded-token border bg-surface p-4 shadow-card';

  return (
    <div className="group relative">
      {href ? (
        <Link
          href={href}
          aria-describedby={hint ? hintId : undefined}
          className={cn(
            shell,
            'transition-[box-shadow,border-color] duration-150 hover:border-border-strong hover:shadow-pop',
          )}
        >
          {body}
          {/* Nói rõ link dẫn tới đâu: tên của link nếu chỉ đọc nội dung là một
              nhãn cộng một số tiền, nghe không ra là đi được đâu. */}
          <span className="sr-only">— xem danh sách giao dịch</span>
        </Link>
      ) : (
        <div
          className={shell}
          // Ô không phải link vẫn phải tới được bằng bàn phím khi có chú thích,
          // nếu không thì hint chỉ tồn tại cho người dùng chuột.
          tabIndex={hint ? 0 : undefined}
          aria-describedby={hint ? hintId : undefined}
        >
          {body}
        </div>
      )}

      {/*
        Hiện/ẩn bằng opacity chứ không phải `hidden`: aria-describedby cần node
        này ở lại trong cây a11y để screen reader đọc được chú thích. Tooltip
        không nhận chuột nên nó không che mất chính ô đang hover.
      */}
      {hint && (
        <span
          id={hintId}
          role="tooltip"
          className="pointer-events-none absolute left-0 right-0 top-full z-20 mt-1.5 rounded-token-sm border bg-surface-raised p-3 text-sm text-ink-secondary opacity-0 shadow-overlay transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {hint}
        </span>
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
