'use client';

import * as Icons from 'lucide-react';

export function Field({
  label,
  error,
  hint,
  children,
  /**
   * `div` cho control KHÔNG phải input/select — ví dụ MultiSelect, vốn là một
   * `<button>`. `<label>` chỉ gắn được với control "labelable"; bọc button trong
   * label thì bấm vào chữ không làm gì cả, và nhãn không gắn được vào control
   * bằng cách máy đọc hiểu. Control đó tự mang `aria-label`.
   */
  as = 'label',
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  as?: 'label' | 'div';
}) {
  const Wrapper = as;

  return (
    <Wrapper className="block space-y-1.5">
      <span className="block text-sm font-medium text-ink">{label}</span>
      {children}
      {/* Lỗi không bao giờ chỉ dựa vào màu viền: luôn có chữ mô tả cụ thể */}
      {error ? (
        <span className="flex items-start gap-1.5 text-sm text-critical">
          <Icons.CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </span>
      ) : (
        hint && <span className="block text-sm text-ink-muted">{hint}</span>
      )}
    </Wrapper>
  );
}
