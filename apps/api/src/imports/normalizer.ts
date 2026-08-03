import { MAX_TRANSACTION_VND } from '@expense/shared';
import { normalizeDescription } from './dedupe';
import { extractMcc } from './mcc';
import type { BankProfile, NormalizedTransaction, RawTransaction, SkippedRow } from './types';

export interface NormalizeResult {
  rows: NormalizedTransaction[];
  skipped: SkippedRow[];
}

/**
 * Chuyển dạng gốc của sao kê sang dạng DB.
 *
 * Đây là nơi duy nhất `amount` mất dấu: sao kê nói bằng số âm/dương, DB nói bằng
 * `amount` dương + `type`. Tách bước này ra khỏi parser là có chủ ý — thêm ngân
 * hàng mới chỉ cần một parser/profile, không ai phải nhớ lại quy ước dấu.
 * Xem ADR 9.4.
 */
export function normalize(rows: RawTransaction[], profile: BankProfile): NormalizeResult {
  const normalized: NormalizedTransaction[] = [];
  const skipped: SkippedRow[] = [];

  for (const row of rows) {
    if (row.amount === 0n) {
      // Không thể suy ra chiều thu/chi từ số 0, và CHECK constraint cũng chặn.
      skipped.push({ rowIndex: row.rowIndex, raw: row.raw, reason: 'Số tiền bằng 0' });
      continue;
    }

    const amount = row.amount < 0n ? -row.amount : row.amount;

    if (amount > BigInt(MAX_TRANSACTION_VND)) {
      // Gần như luôn là parse sai cột (bắt được cột số dư, hoặc ghép hai ô),
      // nên nói thẳng thay vì để CHECK constraint nổ lúc ghi DB.
      skipped.push({
        rowIndex: row.rowIndex,
        raw: row.raw,
        reason: `Số tiền ${amount} vượt mức cho phép — có thể đã đọc sai cột`,
      });
      continue;
    }

    const normalizedDescription = normalizeDescription(row.description, profile.stripPattern);

    normalized.push({
      date: row.date,
      amount,
      type: row.amount < 0n ? 'expense' : 'income',
      description: row.description,
      normalizedDescription,
      balance: row.balance,
      // Cột MCC riêng thắng: nó là dữ liệu có cấu trúc, còn chuỗi trong mô tả thì
      // chỉ là văn bản. Chỉ khi file không có cột đó mới đi rút từ mô tả — và
      // rút ở ĐÂY chứ không ở parser vì tới bước này mô tả đã được chuẩn hoá,
      // nên 'MCC: 5812' và '(mcc-5812)' về cùng một dạng để một regex lo hết.
      mcc: row.mcc ?? extractMcc(normalizedDescription),
      raw: row.raw,
      rowIndex: row.rowIndex,
    });
  }

  return { rows: normalized, skipped };
}
