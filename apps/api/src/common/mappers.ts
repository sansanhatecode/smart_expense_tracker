import { bigintToNumber } from '@expense/shared';
import type { CategoryDto } from '@expense/shared';
import type { TxType } from '../generated/prisma/enums';

/**
 * Chuyển row của Prisma sang DTO đi qua dây.
 *
 * Đây là ranh giới duy nhất được phép đổi BigInt sang number, và nó phải đi qua
 * `bigintToNumber` — hàm đó ném lỗi nếu vượt ngưỡng an toàn thay vì làm tròn âm
 * thầm. CHECK constraint trong DB (`amount <= 10^15`) là thứ bảo đảm việc ném
 * lỗi đó không bao giờ xảy ra trong thực tế. Xem ADR 9.3.
 */

/** `DATE` của Postgres → 'YYYY-MM-DD'. */
export function toDateOnly(date: Date): string {
  // Prisma đọc cột DATE ra Date ở UTC midnight, nên lấy phần UTC là đúng ngày
  // lịch đã lưu. Dùng getFullYear()/getMonth() ở đây sẽ lệch một ngày với máy
  // ở múi giờ âm.
  return date.toISOString().slice(0, 10);
}

/**
 * 'YYYY-MM-DD' → Date ở UTC midnight, chiều ngược của `toDateOnly`.
 *
 * Chỉ repository dùng: đây là bước đổi ngày lịch sang cách Prisma biểu diễn cột
 * DATE, không phải logic nghiệp vụ. Ép UTC để ngày lưu xuống không lệch theo
 * múi giờ của máy chạy API.
 */
export function fromDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function toMoney(value: bigint): number {
  return bigintToNumber(value);
}

export function toNullableMoney(value: bigint | null): number | null {
  return value === null ? null : bigintToNumber(value);
}

export interface CategoryRow {
  id: string;
  name: string;
  type: TxType;
  icon: string;
  color: string;
  sortOrder: number;
}

export type CategorySummary = Pick<CategoryDto, 'id' | 'name' | 'type' | 'icon' | 'color'>;

export function toCategorySummary(row: CategoryRow | null): CategorySummary | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    icon: row.icon,
    color: row.color,
  };
}

export function toCategoryDto(
  row: CategoryRow & { _count?: { transactions: number } },
): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sortOrder,
    ...(row._count ? { transactionCount: row._count.transactions } : {}),
  };
}
