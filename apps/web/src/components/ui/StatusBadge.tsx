'use client';

import * as Icons from 'lucide-react';

/**
 * Trạng thái LUÔN có icon + chữ, không chỉ có màu.
 *
 * Ba màu status (warning, serious, critical) không đủ contrast trên nền sáng để
 * tự mang nghĩa, và người mù màu thì màu không nói gì cả. Icon + chữ là kênh
 * đáng tin, màu chỉ để nhận ra nhanh.
 */
export function StatusBadge({
  status,
  children,
}: {
  status: 'good' | 'warning' | 'critical' | 'neutral';
  children: React.ReactNode;
}) {
  const config = {
    good: { color: 'var(--status-good)', Icon: Icons.Check },
    warning: { color: 'var(--status-warning)', Icon: Icons.TriangleAlert },
    critical: { color: 'var(--status-critical)', Icon: Icons.CircleAlert },
    neutral: { color: 'var(--ink-muted)', Icon: Icons.Minus },
  }[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium"
      style={{ color: config.color }}
    >
      <config.Icon aria-hidden className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}
