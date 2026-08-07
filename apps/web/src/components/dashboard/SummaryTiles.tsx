'use client';

import type { SummaryDto } from '@expense/shared';
import { formatVnd } from '@expense/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import { ArrowRight, Shuffle } from 'lucide-react';
import Link from 'next/link';
import { StatTile } from '@/components/charts';
import { Card, ErrorState, Skeleton } from '@/components/ui';

/** Dựng link sang danh sách giao dịch đứng sau một con số — xem `txLink` ở trang. */
export type TxLink = (params: Record<string, string>) => string;

/**
 * Hàng bốn ô KPI của kỳ đang xem.
 *
 * Lỗi chiếm trọn hàng (`col-span`) chứ không nằm trong một ô: bốn ô cùng đọc từ
 * MỘT query, nên hỏng thì hỏng cả bốn — hiện lỗi ở một ô và để ba ô trống bên
 * cạnh sẽ như thể ba số kia vẫn còn giá trị.
 */
export function SummaryTiles({
  query,
  txLink,
}: {
  query: UseQueryResult<SummaryDto>;
  txLink: TxLink;
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {query.isPending ? (
        <>
          <Skeleton className="h-30" />
          <Skeleton className="h-30" />
          <Skeleton className="h-30" />
          <Skeleton className="h-30" />
        </>
      ) : query.isError ? (
        <Card className="sm:col-span-2 xl:col-span-4">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : (
        <>
          <StatTile
            label="Tổng thu"
            value={query.data.income}
            previous={query.data.previous.income}
            tone="income"
            upIsGood
            hint="Tiền vào các nguồn của bạn trong kỳ. Không tính tiền bạn chuyển giữa hai nguồn của chính mình — đó không phải thu nhập."
            href={txLink({ type: 'income', internal: 'exclude' })}
          />
          <StatTile
            label="Chi tiêu"
            value={query.data.expense}
            previous={query.data.previous.expense}
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
            value={query.data.cashOutflow}
            hint="Tiền thật sự rời khỏi các nguồn của bạn: chi bằng tiền mặt, tài khoản, ví — cộng số đã trả sao kê thẻ trong kỳ. Khoản quẹt thẻ chưa tới hạn trả không tính ở đây, nên số này lệch với Chi tiêu là bình thường."
            href={txLink({ cashflow: 'out' })}
          />
          <StatTile
            label="Còn lại"
            value={query.data.net}
            previous={query.data.previous.net}
            upIsGood
            hint="Tổng thu trừ Chi tiêu của kỳ này. Số âm nghĩa là kỳ này tiêu nhiều hơn thu — không phải số dư còn lại trong tài khoản."
            href={txLink({ internal: 'exclude' })}
          />
        </>
      )}
    </section>
  );
}

/**
 * Nói rõ đã loại gì khỏi các con số phía trên. Giấu tiền đi mà không nói là cách
 * nhanh nhất khiến người dùng mất tin — nhất là khi nhận diện có thể sai và họ
 * là người duy nhất biết điều đó.
 */
export function InternalTransfersNote({
  internal,
  period,
}: {
  internal: SummaryDto['internal'] | undefined;
  period: { from: string; to: string };
}) {
  if (!internal || internal.count === 0) return null;

  return (
    <Link
      // Mang theo kỳ đang xem: không có nó thì link nhảy sang tháng hiện
      // tại và người dùng thấy danh sách rỗng ngay sau khi vừa đọc "đã
      // loại 4 khoản" — trông như link hỏng.
      href={`/transactions?internal=only&from=${period.from}&to=${period.to}`}
      // Nền dịu và viền đứt: đây là một ghi chú về các con số phía trên,
      // không phải một card dữ liệu ngang hàng với chúng.
      className="flex flex-wrap items-center gap-2 rounded-token border border-dashed px-4 py-2.5 text-sm text-ink-secondary transition-colors duration-150 hover:border-border-strong hover:bg-surface-hover hover:text-ink"
    >
      <Shuffle aria-hidden className="size-4 shrink-0 text-ink-muted" />
      Đã loại {internal.count} khoản chuyển tiền nội bộ ({formatVnd(internal.total)}) khỏi thống kê
      <ArrowRight aria-hidden className="size-3.5 shrink-0" />
    </Link>
  );
}
