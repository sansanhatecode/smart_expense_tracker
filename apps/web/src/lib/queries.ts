import type { CategoryDto } from '@expense/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from './api';

/**
 * Danh mục dùng ở gần như mọi trang (dropdown, icon, gán lại danh mục).
 *
 * staleTime dài vì danh mục hiếm khi đổi — không có lý do gọi lại mỗi lần đổi
 * trang. Mutation nào sửa danh mục thì invalidate key này.
 */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<CategoryDto[]>('/api/categories'),
    staleTime: 5 * 60_000,
  });
}

export const CATEGORIES_KEY = ['categories'] as const;

/**
 * Ba key phải tính lại sau khi giao dịch đổi: danh sách, thống kê, ngân sách.
 *
 * Luôn đi cùng nhau, ở mọi nơi sửa giao dịch (thêm, xoá, gán danh mục, import,
 * hoàn lại import). Tách rời thì sớm muộn có chỗ chỉ invalidate `transactions`
 * và người dùng thấy danh sách đã đổi trong khi ô KPI vẫn giữ số cũ.
 */
export function useInvalidateTransactions(): () => void {
  const queryClient = useQueryClient();

  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
    void queryClient.invalidateQueries({ queryKey: ['budgets'] });
  }, [queryClient]);
}
