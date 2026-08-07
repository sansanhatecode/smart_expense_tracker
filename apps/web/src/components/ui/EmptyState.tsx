'use client';

import * as Icons from 'lucide-react';

export function EmptyState({
  icon: Icon = Icons.Inbox,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {/* Icon trong một ô nền dịu chứ không thả trôi: khối rỗng cần một điểm
          neo, nếu không cả vùng trông như trang chưa tải xong. */}
      <span className="flex size-11 items-center justify-center rounded-token bg-surface-hover">
        <Icon className="size-5 text-ink-muted" />
      </span>
      <div className="space-y-1">
        <p className="font-medium text-ink">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-ink-secondary">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
