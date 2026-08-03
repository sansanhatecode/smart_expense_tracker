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

/** Ngày đầu và cuối của một tháng 'YYYY-MM', dạng 'YYYY-MM-DD'. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(year, m - 1, 1));
  const last = new Date(Date.UTC(year, m, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

/** 'YYYY-MM' dịch đi `delta` tháng. Âm là lùi về quá khứ. */
export function addMonths(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/**
 * Tháng hiện tại theo giờ VN, dạng 'YYYY-MM'.
 *
 * Dùng ICT chứ không phải giờ máy: người dùng ở VN mở app lúc 0h30 ngày 1/8 thì
 * "tháng này" phải là tháng 8, và server cũng chốt kỳ mặc định theo đúng múi giờ
 * này (xem StatsService.resolvePeriod).
 */
export function currentMonthKey(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** Ngày đầu và cuối của tháng hiện tại theo giờ VN, dạng 'YYYY-MM-DD'. */
export function currentMonthRange(): { from: string; to: string } {
  return monthRange(currentMonthKey());
}

/**
 * Danh sách 'YYYY-MM' cho ô chọn kỳ, mới nhất trước.
 *
 * `ahead` là số tháng ở tương lai: ngân sách cần đặt trước cho tháng sau, còn
 * các trang chỉ đọc số liệu thì để 0 vì tháng chưa tới luôn rỗng.
 */
export function monthKeyOptions(count: number, ahead = 0): string[] {
  const current = currentMonthKey();
  const options: string[] = [];
  for (let offset = ahead; offset > ahead - count; offset -= 1) {
    options.push(addMonths(current, offset));
  }
  return options;
}

/** Đổi phần trăm giữa hai kỳ. null khi kỳ trước bằng 0 — chia cho 0 không có nghĩa. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
