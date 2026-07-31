'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from './api';
import { AuthProvider } from './auth';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // Không retry lỗi 4xx: request sai thì gửi lại vẫn sai, và với 401
              // thì API client đã tự refresh rồi.
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
          mutations: {
            // Mutation không bao giờ tự retry: gửi lại một POST có thể tạo bản
            // trùng, và người dùng đang đứng đó để bấm lại nếu muốn.
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
