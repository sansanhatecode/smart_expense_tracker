'use client';

/**
 * Đầu trang: tên trang, một dòng ngữ cảnh, và các nút của trang đó.
 *
 * Gom lại một chỗ vì sáu trang đang chép lại cùng một khối markup, và mỗi lần
 * chép là một cơ hội để lệch nhau một bậc chữ hoặc một nấc khoảng cách. Ở đây
 * chúng nhất định giống nhau.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  /** Một dòng nói kỳ đang xem hoặc số lượng — không phải chỗ giải thích dài. */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
