'use client';

import {
  formatVnd,
  type AccountBreakdownItemDto,
  type CategoryBreakdownItemDto,
} from '@expense/shared';
import Link from 'next/link';
import { CategoryIcon } from '@/components/ui';

/**
 * Một dòng bar. Cố ý KHÔNG nhận thẳng DTO của danh mục hay của nguồn tiền: hai
 * DTO đó khác nhau ở tên khoá định danh (`categoryId` / `accountId`), và cả hai
 * vẫn đọc là "một nhãn, một số tiền, một tỷ lệ". Nhận dạng chung này giữ cho
 * chỉ có MỘT cách vẽ breakdown trong app.
 */
export interface BreakdownBarItem {
  /** null = mục gộp ("Chưa phân loại", "Không rõ nguồn"). */
  id: string | null;
  name: string;
  icon: string;
  color: string;
  total: number;
  share: number;
  /**
   * Danh sách giao dịch của đúng dòng này. `null` = không link được.
   *
   * Chỗ gọi truyền vào chứ không tự dựng ở đây: link phải mang theo kỳ và các
   * điều kiện mà con số này được cộng dưới đó, mà component bar thì không biết
   * gì về chúng. Cùng lý do với `href` của StatTile — link ra một danh sách
   * lệch số thì tệ hơn không có link.
   */
  href: string | null;
}

export function categoryBar(
  item: CategoryBreakdownItemDto,
  href: string | null = null,
): BreakdownBarItem {
  return {
    id: item.categoryId,
    name: item.name,
    icon: item.icon,
    color: item.color,
    total: item.total,
    share: item.share,
    href,
  };
}

export function accountBar(
  item: AccountBreakdownItemDto,
  href: string | null = null,
): BreakdownBarItem {
  return {
    id: item.accountId,
    name: item.name,
    icon: item.icon,
    color: item.color,
    total: item.total,
    share: item.share,
    href,
  };
}

export function BreakdownBars({
  items,
  emptyLabel,
}: {
  items: BreakdownBarItem[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-ink-muted">{emptyLabel}</p>;
  }

  const max = Math.max(...items.map((item) => item.total));

  return (
    <ul className="divide-y">
      {items.map((item) => {
        const row = (
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
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-bar-track">
                  <div
                    className="h-full rounded-full bg-bar transition-[width] duration-300"
                    style={{ width: `${(item.total / max) * 100}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-sm text-ink-muted tabular">
                  {(item.share * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        );

        return (
          <li key={item.id ?? 'none'}>
            {item.href ? (
              <Link
                href={item.href}
                className="block px-5 py-3 transition-colors duration-150 hover:bg-surface-hover"
              >
                {row}
                {/* Tên của link nếu chỉ đọc nội dung là "Ăn uống 4.500.000 ₫ 32,1%",
                    nghe không ra là đi được đâu. */}
                <span className="sr-only">— xem giao dịch</span>
              </Link>
            ) : (
              <div className="px-5 py-3">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
