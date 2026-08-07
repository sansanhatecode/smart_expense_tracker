'use client';

import * as Icons from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Đã có lỗi xảy ra';

  return (
    <EmptyState
      icon={Icons.CircleAlert}
      title="Không tải được dữ liệu"
      description={message}
      action={
        onRetry && (
          <Button size="sm" onClick={onRetry}>
            <Icons.RotateCw aria-hidden className="size-4" />
            Thử lại
          </Button>
        )
      }
    />
  );
}
