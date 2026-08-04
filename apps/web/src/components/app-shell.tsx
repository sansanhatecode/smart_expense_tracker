'use client';

import {
  ArrowLeftRight,
  Bug,
  ChartPie,
  Heart,
  Landmark,
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
import { DonateDialog } from './donate-dialog';
import { FeedbackDialog } from './feedback-dialog';
import { Button } from './ui';

const NAV = [
  { href: '/dashboard', label: 'Tổng quan', Icon: LayoutDashboard },
  { href: '/transactions', label: 'Giao dịch', Icon: ArrowLeftRight },
  { href: '/imports', label: 'Import sao kê', Icon: Upload },
  { href: '/accounts', label: 'Nguồn tiền', Icon: Landmark },
  { href: '/budgets', label: 'Ngân sách', Icon: Wallet },
  { href: '/categories', label: 'Danh mục', Icon: Tag },
];

/**
 * Class chung cho một dòng trong sidebar.
 *
 * Dòng điều hướng (`<Link>`) và dòng mở hộp thoại (`<button>`) phải trông y hệt
 * nhau: với người dùng đó là cùng một danh sách, dù bên dưới là hai thẻ HTML khác
 * nhau vì lý do accessibility (xem chú thích ButtonLink trong ui.tsx).
 */
const NAV_ROW =
  'flex w-full items-center gap-2.5 px-2.5 py-2 text-sm font-medium transition-colors';

const NAV_ROW_IDLE = 'text-ink-secondary hover:bg-surface hover:text-ink';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  /** Hộp thoại đang mở, hoặc `null`. Hai cái không bao giờ mở cùng lúc. */
  const [dialog, setDialog] = useState<'feedback' | 'donate' | null>(null);

  // Mở hộp thoại từ menu mobile thì phải đóng menu, nếu không nó nằm dưới lớp
  // backdrop của `<dialog>` và người dùng thấy hộp thoại trên một menu đang mở.
  const openDialog = (which: 'feedback' | 'donate') => {
    setMobileOpen(false);
    setDialog(which);
  };

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
                  className={cn(NAV_ROW, active ? 'bg-accent-soft text-ink' : NAV_ROW_IDLE)}
                  style={{ borderRadius: 'var(--radius-sm)' }}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 space-y-1 border-t pt-4 lg:absolute lg:bottom-5 lg:left-3 lg:right-3 lg:mt-0">
          {/* Báo lỗi nằm ở sidebar chứ không ở một trang cụ thể: lỗi xảy ra ở
              đâu thì phải báo được ngay từ đó, và form tự đính kèm trang đang
              xem — bắt người dùng đi về dashboard để báo thì mất đúng thông tin
              quý nhất. */}
          <button
            type="button"
            onClick={() => openDialog('feedback')}
            className={cn(NAV_ROW, NAV_ROW_IDLE)}
            style={{ borderRadius: 'var(--radius-sm)' }}
          >
            <Bug aria-hidden className="size-4 shrink-0" />
            Báo lỗi / góp ý
          </button>
          <button
            type="button"
            onClick={() => openDialog('donate')}
            className={cn(NAV_ROW, NAV_ROW_IDLE)}
            style={{ borderRadius: 'var(--radius-sm)' }}
          >
            <Heart aria-hidden className="size-4 shrink-0" />
            Ủng hộ dev
          </button>

          {user && (
            <p className="truncate px-2.5 pt-3 text-sm text-ink-muted" title={user.email}>
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

      {/* Mount ở đây, ngoài <nav>: hộp thoại phải sống cả khi menu mobile đã
          đóng, nếu không thì bấm "Báo lỗi" trên điện thoại là menu đóng và hộp
          thoại biến mất theo. */}
      <FeedbackDialog open={dialog === 'feedback'} onClose={() => setDialog(null)} />
      <DonateDialog open={dialog === 'donate'} onClose={() => setDialog(null)} />
    </div>
  );
}
