import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Smart Expense Tracker',
  description: 'Quản lý chi tiêu cá nhân với auto-import từ sao kê ngân hàng',
};

export const viewport: Viewport = {
  // Khai báo cả hai để browser chọn đúng bộ token: xem globals.css
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9f9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0d0d' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
