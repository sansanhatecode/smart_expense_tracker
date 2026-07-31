import { createHash } from 'node:crypto';
import type { TxType } from '../generated/prisma/enums';

/**
 * Dedupe: chặn import trùng mà KHÔNG xoá mất giao dịch trùng lặp hợp lệ.
 *
 * Bài toán có hai yêu cầu kéo ngược nhau:
 *
 *   1. Import lại file chồng kỳ → không được sinh thêm bản nào.
 *   2. Hai ly cà phê 25.000đ cùng ngày cùng mô tả → phải giữ CẢ HAI.
 *
 * Hash chỉ gồm (date, amount, description) thoả (1) nhưng vi phạm (2) — nó biến
 * giao dịch thứ hai thành "trùng" và unique constraint xoá nó âm thầm. Đó là mất
 * dữ liệu, và với chi tiêu thật thì chắc chắn xảy ra.
 *
 * Lời giải là thêm `seq`: thứ tự xuất hiện trong nhóm các dòng giống hệt nhau.
 *
 *   Hai ly cà phê  → seq 0 và 1 → hai hash khác nhau → giữ cả hai      ✓
 *   Import lại file → vẫn seq 0 và 1 → cùng hash → nhận ra trùng       ✓
 *
 * ─── Vì sao KHÔNG dùng `balance` trong hash ───
 *
 * Số dư sau giao dịch thoạt trông là discriminator hoàn hảo, nhưng dùng nó tạo
 * ra hai không gian hash rời nhau: dòng từ sao kê có balance, còn giao dịch
 * nhập tay thì không. Hệ quả là nhập tay "cà phê 25k ngày 15/7" rồi import sao
 * kê chứa đúng giao dịch đó sẽ ra hai bản — đúng loại trùng mà người dùng thấy
 * rõ nhất và khó hiểu nhất.
 *
 * Dùng `seq` cho cả hai đường thì chúng chung một không gian:
 *
 *   nhập tay  → seq = số giao dịch ĐÃ CÓ trong DB cùng khoá
 *   dòng import → seq = thứ tự trong nhóm cùng khoá, TÍNH TRONG BATCH
 *
 * Nhờ đó: nhập tay 1 ly cà phê (seq 0), rồi import file có 2 ly → dòng đầu ra
 * seq 0 nên bị nhận là trùng, dòng thứ hai ra seq 1 nên được thêm. Đúng.
 *
 * `seq` của dòng import phải tính TRONG BATCH, không cộng thêm số dòng đã có
 * trong DB — nếu cộng thì import lại cùng file sẽ ra seq 2,3 thay vì 0,1, hash
 * khác đi và dedupe mất tác dụng hoàn toàn.
 *
 * `balance` vẫn được lưu, chỉ là không tham gia hash: nó hữu ích để đối chiếu
 * khi parse sai.
 */

/**
 * Chuẩn hoá mô tả trước khi hash.
 *
 * Cố tình GIỮ chữ số. Mô tả sao kê hay chứa mã tham chiếu, và bỏ chữ số đi thì
 * hai giao dịch khác nhau có thể trùng khoá — mất dữ liệu, tệ hơn là sinh trùng.
 * Nếu gặp ngân hàng phát ra mã biến động giữa các lần export, chỗ xử lý đúng là
 * `stripPattern` trong BankProfile, không phải làm yếu hàm này cho mọi ngân hàng.
 */
export function normalizeDescription(description: string, stripPattern?: RegExp): string {
  let text = description;

  if (stripPattern) {
    text = text.replace(stripPattern, ' ');
  }

  return text
    .normalize('NFD')
    // Bỏ dấu tiếng Việt: cùng một giao dịch có thể được export có dấu hoặc không.
    // Dùng escape thay vì ký tự combining viết thẳng, để không phụ thuộc vào việc
    // file được lưu/hiển thị đúng encoding.
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    // Mọi thứ không phải chữ/số thành khoảng trắng, rồi gộp lại.
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export interface DedupeKeyInput {
  userId: string;
  /** 'YYYY-MM-DD' — ngày lịch, khớp với cột DATE. */
  date: string;
  /** Số nguyên VND, luôn dương. */
  amount: bigint;
  type: TxType;
  /** Mô tả ĐÃ qua normalizeDescription. */
  normalizedDescription: string;
  /** Thứ tự trong nhóm các dòng giống hệt nhau. Xem chú thích ở đầu file. */
  seq: number;
}

/**
 * Khoá nhóm "các dòng giống hệt nhau" — dùng để đếm seq. Không gồm seq.
 */
export function dedupeGroupKey(
  input: Omit<DedupeKeyInput, 'seq' | 'userId'>,
): string {
  return [input.date, input.amount.toString(), input.type, input.normalizedDescription].join('|');
}

/** sha256 thay sha1: không có lý do gì chọn hàm yếu hơn khi giá như nhau. */
export function computeDedupeHash(input: DedupeKeyInput): string {
  const material = [
    input.userId,
    input.date,
    input.amount.toString(),
    input.type,
    input.normalizedDescription,
    String(input.seq),
  ].join('|');

  return createHash('sha256').update(material).digest('hex');
}

/**
 * Gán seq cho một loạt dòng vừa parse, tính trong phạm vi batch.
 *
 * `seqOffsets` cho phép truyền vào số dòng đã có trong DB theo từng group key —
 * dùng cho giao dịch nhập tay (offset = số đã có). Với import thì để trống, vì
 * cộng offset sẽ phá dedupe khi import lại cùng file.
 */
export function assignSequences<T extends Omit<DedupeKeyInput, 'seq' | 'userId'>>(
  rows: T[],
  seqOffsets?: Map<string, number>,
): Array<T & { seq: number }> {
  const counters = new Map<string, number>();

  return rows.map((row) => {
    const key = dedupeGroupKey(row);
    const offset = seqOffsets?.get(key) ?? 0;
    const used = counters.get(key) ?? 0;
    counters.set(key, used + 1);
    return { ...row, seq: offset + used };
  });
}
