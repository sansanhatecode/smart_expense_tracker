'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

/** Link "Tất cả" ở góc phải đầu card, dẫn sang trang đầy đủ của khối đó. */
export function SeeAllLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-1 text-sm font-medium text-accent hover:underline"
    >
      Tất cả
      <ArrowRight
        aria-hidden
        className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
      />
    </Link>
  );
}
