'use client';

import {
  ArrowLeftRight,
  ChartPie,
  LayoutDashboard,
  LogOut,
  Menu,
  Tag,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from './ui';

const NAV = [
  { href: '/dashboard', label: 'Tổng quan', Icon: LayoutDashboard },
  { href: '/transactions', label: 'Giao dịch', Icon: ArrowLeftRight },
  { href: '/imports', label: 'Import sao kê', Icon: Upload },
  { href: '/budgets', label: 'Ngân sách', Icon: Wallet },
  { href: '/categories', label: 'Danh mục', Icon: Tag },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      {/* ─── Header cho mobile ─── */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-page px-4 py-3 lg:hidden">
        <span className="flex items-center gap-2 font-semibold text-ink">
          <ChartPie aria-hidden className="size-5 text-accent" />
          Chi tiêu
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </header>

      {/* ─── Sidebar ─── */}
      <nav
        className={cn(
          'border-b bg-page px-3 py-3 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r lg:py-5',
          mobileOpen ? 'block' : 'hidden lg:block',
        )}
      >
        <span className="mb-6 hidden items-center gap-2 px-2 font-semibold text-ink lg:flex">
          <ChartPie aria-hidden className="size-5 text-accent" />
          Chi tiêu
        </span>

        <ul className="space-y-1">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-accent-soft text-ink'
                      : 'text-ink-secondary hover:bg-surface hover:text-ink',
                  )}
                  style={{ borderRadius: 'var(--radius-sm)' }}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 space-y-2 border-t pt-4 lg:absolute lg:bottom-5 lg:left-3 lg:right-3 lg:mt-0">
          {user && (
            <p className="truncate px-2.5 text-sm text-ink-muted" title={user.email}>
              {user.name ?? user.email}
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void logout()}
            className="w-full justify-start"
          >
            <LogOut aria-hidden className="size-4" />
            Đăng xuất
          </Button>
        </div>
      </nav>

      <main className="min-w-0 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
