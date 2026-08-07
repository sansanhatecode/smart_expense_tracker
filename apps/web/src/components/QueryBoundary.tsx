'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { ErrorState, Skeleton } from '@/components/ui';

/**
 * Ba nhánh của một query — đang tải, lỗi, có dữ liệu — gom về một chỗ.
 *
 * Gần như mọi card trong app lặp lại đúng ba nhánh đó, và chép tay thì dễ rơi
 * mất nút "Thử lại" hoặc để lỗi lặng lẽ thành một khoảng trắng. Ở đây thì không
 * chỗ nào quên được.
 *
 * `skeleton` do chỗ gọi truyền vào: khối chờ phải mang hình dạng của thứ sắp
 * hiện ra (một chart cao 224px, sáu dòng danh sách…), không phải một hình chữ
 * nhật chung cho mọi chỗ — hứa sai hình dạng thì lúc dữ liệu về cả trang nhảy.
 */
export function QueryBoundary<T>({
  query,
  skeleton,
  children,
}: {
  query: UseQueryResult<T>;
  skeleton?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending) return <>{skeleton ?? <Skeleton className="h-32" />}</>;

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  return <>{children(query.data)}</>;
}
