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
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { DonateDialog } from './DonateDialog';
import { FeedbackDialog } from './FeedbackDialog';
import { ThemeToggle } from './ThemeToggle';
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
  'flex w-full items-center gap-2.5 rounded-token-sm px-2.5 py-2 text-sm font-medium transition-colors duration-150';

const NAV_ROW_IDLE = 'text-ink-secondary hover:bg-surface-hover hover:text-ink';

type DialogKind = 'feedback' | 'donate';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  /** Hộp thoại đang mở, hoặc `null`. Hai cái không bao giờ mở cùng lúc. */
  const [dialog, setDialog] = useState<DialogKind | null>(null);

  // Mở hộp thoại từ menu mobile thì phải đóng menu, nếu không nó nằm dưới lớp
  // backdrop của `<dialog>` và người dùng thấy hộp thoại trên một menu đang mở.
  const openDialog = (which: DialogKind) => {
    setMobileOpen(false);
    setDialog(which);
  };

  /**
   * Trong lúc drawer mở: Escape đóng nó, và trang phía sau không cuộn được.
   *
   * Khoá cuộn vì drawer phủ toàn màn hình trên điện thoại — không khoá thì ngón
   * tay vuốt trên drawer làm trang bên dưới trôi đi, và đóng menu ra là đang
   * đứng ở một chỗ khác chỗ vừa rời.
   */
  useEffect(() => {
    if (!mobileOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* ─── Header cho mobile ─── */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-page/90 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMobileOpen(true)}
          aria-label="Mở menu"
          aria-expanded={mobileOpen}
        >
          <Menu className="size-5" />
        </Button>
      </header>

      {/* ─── Sidebar cố định trên desktop ─── */}
      <nav className="hidden border-r bg-page lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:px-3 lg:py-5">
        <SidebarBody onNavigate={() => undefined} onOpenDialog={openDialog} />
      </nav>

      {/*
        ─── Drawer trên mobile ───

        Chỉ dựng khi mở, chứ không dựng sẵn rồi đẩy ra ngoài màn hình bằng
        transform: một sidebar nằm ngoài khung nhìn vẫn nhận được Tab và vẫn được
        screen reader đọc, nên người dùng bàn phím sẽ lạc vào một menu họ không
        nhìn thấy. Dựng khi mở cũng cho luôn hiệu ứng trượt vào mà không cần
        theo dõi kích thước màn hình bằng JS.
      */}
      {mobileOpen && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Đóng menu"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm"
          />
          {/* `overflow-y-auto` cho máy màn hình thấp: mở drawer ở chế độ ngang
              thì danh sách cao hơn khung, và không cuộn được nghĩa là mấy mục
              cuối vĩnh viễn không bấm tới. */}
          <nav className="fixed inset-y-0 left-0 z-40 flex w-68 max-w-[85vw] animate-[drawer-in_180ms_ease-out] flex-col overflow-y-auto border-r bg-page px-3 py-4 shadow-overlay">
            <div className="mb-4 flex items-center justify-between gap-3 px-1">
              <Brand />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileOpen(false)}
                aria-label="Đóng menu"
              >
                <X className="size-5" />
              </Button>
            </div>
            <SidebarBody
              onNavigate={() => setMobileOpen(false)}
              onOpenDialog={openDialog}
            />
          </nav>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 lg:px-8 lg:py-8">
        {/* Bề rộng nội dung quyết định ở đây, một lần. Trang nào cần cột hẹp hơn
            thì tự đặt max-w của mình mà KHÔNG căn giữa — nhờ vậy mọi trang chung
            một mép trái và chuyển trang không thấy nội dung nhảy ngang. */}
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      {/* Mount ở đây, ngoài <nav>: hộp thoại phải sống cả khi menu mobile đã
          đóng, nếu không thì bấm "Báo lỗi" trên điện thoại là menu đóng và hộp
          thoại biến mất theo. */}
      <FeedbackDialog open={dialog === 'feedback'} onClose={() => setDialog(null)} />
      <DonateDialog open={dialog === 'donate'} onClose={() => setDialog(null)} />
    </div>
  );
}

function Brand() {
  return (
    <span className="flex items-center gap-2 font-semibold text-ink">
      <span className="flex size-8 items-center justify-center rounded-token-sm bg-accent-soft">
        <ChartPie aria-hidden className="size-4.5 text-accent" />
      </span>
      Chi tiêu
    </span>
  );
}

/**
 * Ruột của sidebar, dùng chung cho cả bản desktop và drawer mobile.
 *
 * Một nguồn duy nhất cho danh sách điều hướng: hai bản chép tay là hai chỗ để
 * quên thêm mục mới, và người dùng điện thoại là người phát hiện ra sau cùng.
 */
function SidebarBody({
  onNavigate,
  onOpenDialog,
}: {
  onNavigate: () => void;
  onOpenDialog: (which: DialogKind) => void;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    /*
      `flex-1`, KHÔNG phải `h-full`. Trong drawer mobile, khối này là em của
      hàng tiêu đề, nên `h-full` = 100% chiều cao nav và tổng hai phần vượt quá
      khung — khối user ở đáy bị đẩy ra ngoài màn hình. `flex-1` chỉ lấy phần
      còn thừa. `min-h-0` để nó co được khi nội dung dài hơn khung.
    */
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Thương hiệu chỉ hiện ở bản desktop — bản drawer đã có nó ở hàng trên
          cùng, cạnh nút đóng. */}
      <span className="mb-6 hidden px-1 lg:block">
        <Brand />
      </span>

      <ul className="space-y-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  NAV_ROW,
                  active ? 'bg-accent-soft font-semibold text-ink' : NAV_ROW_IDLE,
                )}
              >
                {/* Trang đang xem được đánh dấu bằng BA thứ cùng lúc: nền, chữ
                    đậm hơn, icon đổi màu. Chỉ nền thôi thì ở dark mode nó là một
                    mảng xanh đậm trên nền đen — thấy có gì đó khác, nhưng không
                    rõ là "đang ở đây". */}
                <Icon
                  aria-hidden
                  className={cn('size-4 shrink-0', active && 'text-accent')}
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* `mt-auto` đẩy khối này xuống đáy sidebar trên desktop, và để nó chạy
          ngay sau danh sách trên mobile — cùng một markup, không cần định vị
          tuyệt đối như trước. */}
      <div className="mt-auto pt-6">
        <div className="space-y-1">
          {/* Báo lỗi nằm ở sidebar chứ không ở một trang cụ thể: lỗi xảy ra ở
              đâu thì phải báo được ngay từ đó, và form tự đính kèm trang đang
              xem — bắt người dùng đi về dashboard để báo thì mất đúng thông tin
              quý nhất. */}
          <button
            type="button"
            onClick={() => onOpenDialog('feedback')}
            className={cn(NAV_ROW, NAV_ROW_IDLE)}
          >
            <Bug aria-hidden className="size-4 shrink-0" />
            Báo lỗi / góp ý
          </button>
          <button
            type="button"
            onClick={() => onOpenDialog('donate')}
            className={cn(NAV_ROW, NAV_ROW_IDLE)}
          >
            <Heart aria-hidden className="size-4 shrink-0" />
            Ủng hộ dev
          </button>
        </div>

        <ThemeToggle className="mt-3" />

        {user && (
          <div className="mt-3 flex items-center gap-2.5 border-t px-1 pt-3">
            {/* Chữ cái đầu thay ảnh đại diện: app không có ảnh, mà một ô trống
                hình tròn thì trông như ảnh tải lỗi. */}
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-sm font-semibold text-ink-secondary"
            >
              {(user.name ?? user.email).trim().charAt(0).toUpperCase()}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm text-ink-secondary" title={user.email}>
              {user.name ?? user.email}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void logout()}
              aria-label="Đăng xuất"
              title="Đăng xuất"
              className="shrink-0 px-2"
            >
              <LogOut aria-hidden className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
