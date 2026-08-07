'use client';

import { cn } from '@/lib/utils';
import { CONTROL_BASE } from './controlStyles';

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(CONTROL_BASE, 'h-10 appearance-none px-3 pr-8', className)}
      style={{
        // Mũi tên vẽ bằng SVG inline chứ không phải một icon React: `<select>`
        // không nhận con nào ngoài `<option>`, nên nó phải là ảnh nền.
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23898781' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.5rem center',
        backgroundSize: '1rem',
      }}
      {...props}
    >
      {children}
    </select>
  );
}
