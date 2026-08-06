import { isCardBillPayment, normalizeHeader } from './parse-value';
import type { AccountKind } from '../generated/prisma/enums';
import type { BankProfile, RawTransaction } from './types';

export interface DetectedAccount {
  kind: AccountKind;
  /**
   * Khoá ổn định để lần import sau map vào đúng account đã có. Dùng
   * `profile.bank` chứ không phải `profile.id`: generic / generic-iso /
   * generic-us là cùng một ngân hàng xuất file với định dạng ngày khác nhau,
   * gộp chúng lại là đúng.
   *
   * Với thẻ tín dụng, nếu người dùng có nhập tên thẻ ở form upload thì tên đó
   * (đã chuẩn hoá) được gấp thêm vào cuối, thành `bank:credit_card:tenThe` —
   * nhờ vậy hai thẻ cùng ngân hàng không còn bị gộp chung một account. Không
   * nhập tên thẻ thì fingerprint y hệt hôm nay.
   */
  fingerprint: string;
  /** Tên mặc định lúc tạo. Người dùng đổi được và đổi rồi thì không bị ghi đè. */
  name: string;
}

/**
 * Suy ra nguồn tiền của một file sao kê, không hỏi người dùng — trừ tên thẻ,
 * thứ file không tự nói ra được (xem cardName bên dưới).
 *
 * Tên file cố tình KHÔNG tham gia: nó đổi theo từng lần tải về
 * ('sao-ke-thang-7.csv', 'statement_2026_08.xlsx') nên lấy nó làm khoá thì mỗi
 * tháng lại đẻ ra một account mới.
 *
 * `cardName`: tên thẻ người dùng gõ ở form upload, tuỳ chọn. Chỉ có tác dụng
 * khi kind suy ra được là credit_card — gõ nhầm gì đó vào ô này lúc upload sao
 * kê ngân hàng/ví thì bị bỏ qua, không làm lệch fingerprint của loại nguồn
 * tiền không liên quan.
 */
export function detectAccount(
  profile: BankProfile,
  rows: RawTransaction[],
  cardName?: string,
): DetectedAccount {
  const kind = detectKind(profile, rows);
  const trimmedCardName = kind === 'credit_card' ? cardName?.trim() : undefined;

  if (trimmedCardName) {
    return {
      kind,
      fingerprint: `${profile.bank}:${kind}:${normalizeHeader(trimmedCardName)}`,
      name: defaultAccountName(profile.bank, kind, trimmedCardName),
    };
  }

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
 *
 * `cardName` chỉ có ý nghĩa khi `kind === 'credit_card'` — gọi hàm này với
 * cardName cho bank/wallet là lỗi của chỗ gọi, không phải hàm này tự kiểm.
 */
export function defaultAccountName(bank: string, kind: AccountKind, cardName?: string): string {
  if (cardName) {
    // Profile generic không biết mình là ngân hàng nào — bỏ hẳn phần "${bank}"
    // thay vì in ra 'Thẻ tín dụng generic - ...' vô nghĩa.
    return bank === 'generic' ? `Thẻ tín dụng - ${cardName}` : `Thẻ tín dụng ${bank} - ${cardName}`;
  }

  // Profile generic không biết mình là ngân hàng nào, và `label` của nó là 'Tự
  // động nhận dạng' — đúng cho dropdown chọn profile, vô nghĩa làm tên nguồn tiền.
  if (bank === 'generic') return GENERIC_NAMES[kind];

  return kind === 'credit_card' ? `Thẻ tín dụng ${bank}` : bank;
}
