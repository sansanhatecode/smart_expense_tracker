import { isCardBillPayment } from './parse-value';
import type { AccountKind } from '../generated/prisma/enums';
import type { BankProfile, RawTransaction } from './types';

export interface DetectedAccount {
  kind: AccountKind;
  /**
   * Khoá ổn định để lần import sau map vào đúng account đã có. Dùng
   * `profile.bank` chứ không phải `profile.id`: generic / generic-iso /
   * generic-us là cùng một ngân hàng xuất file với định dạng ngày khác nhau,
   * gộp chúng lại là đúng.
   */
  fingerprint: string;
  /** Tên mặc định lúc tạo. Người dùng đổi được và đổi rồi thì không bị ghi đè. */
  name: string;
}

/**
 * Suy ra nguồn tiền của một file sao kê, không hỏi người dùng.
 *
 * Chỉ dựa vào những gì file tự nói ra. Tên file cố tình KHÔNG tham gia: nó đổi
 * theo từng lần tải về ('sao-ke-thang-7.csv', 'statement_2026_08.xlsx') nên lấy
 * nó làm khoá thì mỗi tháng lại đẻ ra một account mới.
 */
export function detectAccount(profile: BankProfile, rows: RawTransaction[]): DetectedAccount {
  const kind = detectKind(profile, rows);

  return {
    kind,
    fingerprint: `${profile.bank}:${kind}`,
    name: defaultAccountName(profile.bank, kind),
  };
}

function detectKind(profile: BankProfile, rows: RawTransaction[]): AccountKind {
  if (profile.id === 'momo') return 'wallet';

  // MCC chỉ tồn tại trên sao kê thẻ: `row.mcc` ở bước này chỉ được điền từ cột
  // MCC riêng, mà sao kê tài khoản thanh toán không có cột đó.
  if (rows.some((row) => row.mcc !== null)) return 'credit_card';

  // Không có cột MCC thì còn một dấu hiệu nữa: khoản trả nợ thẻ xuất hiện dưới
  // dạng tiền VÀO. Trên sao kê tài khoản thanh toán cũng khoản đó nhưng là tiền
  // RA — nên chiều tiền là thứ phân biệt hai file, không phải chuỗi mô tả.
  if (rows.some((row) => row.amount > 0n && isCardBillPayment(row.description))) {
    return 'credit_card';
  }

  return 'bank';
}

const GENERIC_NAMES: Record<AccountKind, string> = {
  bank: 'Tài khoản ngân hàng',
  credit_card: 'Thẻ tín dụng',
  wallet: 'Ví điện tử',
};

/**
 * Tên mặc định của một nguồn tiền. Export để script backfill đặt tên y hệt
 * đường import — hai chỗ lệch nhau sẽ cho ra hai cái tên cho cùng một cái ví.
 */
export function defaultAccountName(bank: string, kind: AccountKind): string {
  // Profile generic không biết mình là ngân hàng nào, và `label` của nó là 'Tự
  // động nhận dạng' — đúng cho dropdown chọn profile, vô nghĩa làm tên nguồn tiền.
  if (bank === 'generic') return GENERIC_NAMES[kind];

  return kind === 'credit_card' ? `Thẻ tín dụng ${bank}` : bank;
}
