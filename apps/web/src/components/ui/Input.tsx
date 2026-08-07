'use client';

import { cn } from '@/lib/utils';
import { CONTROL_BASE } from './controlStyles';

export function Input({
  className,
  invalid,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(CONTROL_BASE, 'h-10 px-3', invalid && 'border-critical', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}
