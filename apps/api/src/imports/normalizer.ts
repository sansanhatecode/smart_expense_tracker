import { MAX_TRANSACTION_VND } from '@expense/shared';
import { normalizeDescription } from './dedupe';
import { extractMcc } from './mcc';
import { isCardBillPayment, isSelfTransfer, isWalletTopup } from './parse-value';
import type { AccountKind, InternalKind } from '../generated/prisma/enums';
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
 *
 * Cũng là nơi quyết định dòng nào là dịch chuyển nội bộ, vì đó là câu hỏi cần
 * cả chiều tiền LẪN loại nguồn tiền — parser không biết cái thứ hai.
 */
export function normalize(
  rows: RawTransaction[],
  profile: BankProfile,
  accountKind: AccountKind,
): NormalizeResult {
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
      internalKind: classifyInternal(row.description, row.amount, accountKind),
      raw: row.raw,
      rowIndex: row.rowIndex,
    });
  }

  return { rows: normalized, skipped };
}

/**
 * Dòng này là tiền dịch chuyển giữa các nguồn của chính người dùng, hay là chi
 * tiêu/thu nhập thật?
 *
 * Mỗi luật đòi đủ BA điều kiện — mô tả, chiều tiền, loại nguồn — chứ không chỉ
 * mô tả. Chiều tiền là thứ phân biệt hai mặt của cùng một giao dịch, và loại
 * nguồn là thứ cho biết mặt nào hợp lý ở file nào. Chỉ khớp chuỗi thì một khoản
 * "nạp tiền" nhận được từ người khác cũng thành nội bộ.
 *
 * Cả hai vế của một lần chuyển đều được đánh dấu, độc lập với nhau. Không có
 * bước ghép đôi hai vế: matching theo số tiền và ngày rất mong manh, mà để loại
 * chúng khỏi thống kê thì không cần ghép.
 *
 * `amount` ở đây vẫn CÓ DẤU (dạng gốc của sao kê): âm = tiền ra, dương = tiền vào.
 */
function classifyInternal(
  description: string,
  amount: bigint,
  accountKind: AccountKind,
): InternalKind | null {
  const moneyIn = amount > 0n;

  if (isCardBillPayment(description)) {
    // Trên THẺ khoản này là tiền vào (giảm dư nợ); trên TÀI KHOẢN THANH TOÁN
    // cũng khoản đó nhưng là tiền ra. Chiều nào không khớp với loại nguồn thì
    // đây là thứ khác — không đoán.
    if (accountKind === 'credit_card' ? moneyIn : !moneyIn) return 'card_payment';
    return null;
  }

  if (isWalletTopup(description)) {
    // Tiền rời ngân hàng để vào ví, hoặc tiền vào ví đến từ ngân hàng.
    if (accountKind === 'wallet' ? moneyIn : !moneyIn) return 'wallet_topup';
    return null;
  }

  if (isSelfTransfer(description)) return 'self_transfer';

  // Rút tiền ATM cố tình KHÔNG nằm ở đây. Không có tài khoản tiền mặt để tiền
  // chảy vào, nên đánh dấu nội bộ sẽ làm khoản đó biến mất khỏi mọi thống kê.
  return null;
}
