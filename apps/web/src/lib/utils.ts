import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** 'YYYY-MM-DD' → '15/07/2026'. Không đi qua Date để không lệch múi giờ. */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** 'YYYY-MM-DD' → '15 thg 7'. Dùng cho nhãn chart và danh sách. */
export function formatDateShort(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(day)} thg ${Number(month)}`;
}

/** 'YYYY-MM' → 'Tháng 7/2026'. */
export function formatMonth(month: string): string {
  const [year, m] = month.split('-');
  return `Tháng ${Number(m)}/${year}`;
}

/** 'YYYY-MM' → 'T7'. Nhãn trục chart, cần ngắn. */
export function formatMonthAxis(month: string): string {
  return `T${Number(month.split('-')[1])}`;
}

/** Ngày đầu và cuối của tháng hiện tại theo giờ VN, dạng 'YYYY-MM-DD'. */
export function currentMonthRange(): { from: string; to: string } {
  const nowIct = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const year = nowIct.getUTCFullYear();
  const month = nowIct.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

export function currentMonthKey(): string {
  return currentMonthRange().from.slice(0, 7);
}

/** Đổi phần trăm giữa hai kỳ. null khi kỳ trước bằng 0 — chia cho 0 không có nghĩa. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
