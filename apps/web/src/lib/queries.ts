import type { CategoryDto } from '@expense/shared';
import { useQuery } from '@tanstack/react-query';
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
