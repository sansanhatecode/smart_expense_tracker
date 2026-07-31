import type { TxType } from '../generated/prisma/enums';

export interface CategorizerRule {
  /** Đã uppercase. */
  keyword: string;
  categoryId: string;
  /** Chiều của danh mục — rule chỉ áp cho giao dịch cùng chiều. */
  categoryType: TxType;
  priority: number;
}

export interface CategorizableRow {
  /** Mô tả đã qua normalizeDescription. */
  normalizedDescription: string;
  type: TxType;
}

/**
 * Auto-categorize bằng keyword.
 *
 * Thứ tự thắng khi nhiều rule cùng khớp:
 *   1. `priority` cao hơn — người dùng đặt được rule đè lên rule mặc định
 *   2. keyword DÀI hơn — cụ thể hơn thì thắng
 *
 * Điểm (2) là thứ dễ bỏ sót nhưng quyết định kết quả có hợp lý không. Ví dụ có
 * cả rule "COFFEE" → Ăn uống và "THE COFFEE HOUSE" → Cà phê: nếu chỉ xét
 * priority thì kết quả phụ thuộc thứ tự đọc từ DB, tức không xác định. Chọn
 * keyword dài hơn cho ra kết quả ổn định và đúng trực giác.
 *
 * Rule phải cùng chiều thu/chi với giao dịch. Không có kiểm tra này thì keyword
 * "LUONG" (danh mục thu) sẽ gán cho một khoản chi có chữ "LUONG" trong mô tả, và
 * transactions.service sẽ từ chối vì lệch chiều — tức người dùng nhận lỗi ở chỗ
 * họ không hiểu được.
 */
export function categorize(
  row: CategorizableRow,
  rules: CategorizerRule[],
): string | null {
  let best: CategorizerRule | null = null;

  for (const rule of rules) {
    if (rule.categoryType !== row.type) continue;
    if (!row.normalizedDescription.includes(rule.keyword)) continue;

    if (best === null || isBetter(rule, best)) {
      best = rule;
    }
  }

  return best?.categoryId ?? null;
}

function isBetter(candidate: CategorizerRule, current: CategorizerRule): boolean {
  if (candidate.priority !== current.priority) {
    return candidate.priority > current.priority;
  }
  return candidate.keyword.length > current.keyword.length;
}

/** Gán danh mục cho cả loạt. Tách ra để service không phải lặp thủ công. */
export function categorizeAll<T extends CategorizableRow>(
  rows: T[],
  rules: CategorizerRule[],
): Array<T & { categoryId: string | null }> {
  return rows.map((row) => ({ ...row, categoryId: categorize(row, rules) }));
}
