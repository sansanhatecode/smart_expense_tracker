'use client';

import { cn } from '@/lib/utils';
import { CONTROL_BASE } from './controlStyles';

export function Textarea({
  className,
  invalid,
  rows = 4,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      rows={rows}
      className={cn(CONTROL_BASE, 'px-3 py-2', invalid && 'border-critical', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}
