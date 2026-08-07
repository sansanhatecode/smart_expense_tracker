'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePref } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Chọn theme: Sáng / Tối / Theo hệ thống.
 *
 * Là segmented control chứ không phải nút bật-tắt hai trạng thái, vì "theo hệ
 * thống" là một lựa chọn thật chứ không phải trạng thái mặc định vô hình — nút
 * hai trạng thái buộc người dùng khoá cứng một bên và mất luôn khả năng đi theo
 * lịch sáng/tối của máy.
 *
 * Dùng radiogroup: ba ô loại trừ nhau, và bàn phím đi giữa chúng bằng phím mũi
 * tên như mọi radio khác thay vì phải Tab ba lần.
 */
const OPTIONS: Array<{ value: ThemePref; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Sáng', Icon: Sun },
  { value: 'dark', label: 'Tối', Icon: Moon },
  { value: 'system', label: 'Theo hệ thống', Icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { pref, setPref } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Giao diện sáng tối"
      className={cn('flex gap-0.5 rounded-token-sm border bg-surface p-0.5', className)}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        // `pref === null` = chưa đọc được lựa chọn đã lưu (xem useTheme). Lúc đó
        // không ô nào sáng, thay vì làm sáng nhầm ô rồi nhảy sang ô khác.
        const active = pref === value;

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setPref(value)}
            className={cn(
              // Bo góc trong nhỏ hơn góc ngoài đúng bằng padding của khung
              // (0.125rem): dùng lại `rounded-token-sm` thì hai đường cong lệch
              // nhau và ô bên trong trông như bị kê vênh.
              'flex h-7 flex-1 items-center justify-center rounded-[calc(var(--radius-sm)-0.125rem)] transition-colors',
              active
                ? 'bg-accent-soft text-ink'
                : 'text-ink-muted hover:bg-surface-hover hover:text-ink',
            )}
          >
            <Icon aria-hidden className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
