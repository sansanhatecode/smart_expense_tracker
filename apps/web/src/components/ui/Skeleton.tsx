'use client';

import { cn } from '@/lib/utils';

/** Khối chờ. Hình dạng và chuyển động nằm ở class `.skeleton` trong globals.css. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-token-sm', className)} />;
}
