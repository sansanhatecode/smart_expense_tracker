/**
 * Parse số tiền và ngày từ ô của sao kê.
 *
 * Đây là chỗ dữ liệu thật làm vỡ code nhiều nhất, nên mọi hàm ở đây trả `null`
 * khi không chắc thay vì đoán. Một dòng bị bỏ kèm lý do thì người dùng thấy và
 * sửa được; một dòng bị đoán sai thành số tiền khác thì không ai phát hiện.
 */

/**
 * Số tiền trong sao kê VN xuất hiện dưới nhiều dạng:
 *
 *   "1.234.567"      dấu chấm phân tách nghìn (phổ biến nhất ở VN)
 *   "1,234,567"      dấu phẩy phân tách nghìn (bản tiếng Anh)
 *   "1 234 567"      khoảng trắng
 *   "1,234,567.00"   kiểu Mỹ, có phần thập phân
 *   "1.234.567,00"   kiểu Âu/VN, có phần thập phân
 *   "(1.234.567)"    ngoặc = số âm (kế toán)
 *   "-1.234.567"     dấu trừ
 *   "1.234.567 VND"  kèm đơn vị
 *   ""  "-"  "0.00"  ô trống
 *
 * Quy tắc phân biệt thập phân với phân tách nghìn: dấu phân cách CUỐI CÙNG là
 * thập phân nếu sau nó có đúng 1–2 chữ số và nó là dấu duy nhất thuộc loại đó.
 * VND không có đơn vị nhỏ hơn đồng nên phần thập phân được làm tròn.
 */
export function parseStatementAmount(raw: string | null | undefined): bigint | null {
  if (raw === null || raw === undefined) return null;

  let text = String(raw).trim();
  if (text === '' || text === '-' || text === '--') return null;

  // Bỏ đơn vị tiền tệ và mọi thứ không phải chữ số / dấu phân cách / dấu âm
  text = text.replace(/(vnd|vnđ|đ|₫)/gi, '').trim();

  let negative = false;

  // Ngoặc kiểu kế toán: (1.234) nghĩa là -1.234
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1).trim();
  } else if (text.startsWith('+')) {
    text = text.slice(1).trim();
  }

  // Khoảng trắng chỉ có thể là phân tách nghìn
  text = text.replace(/\s/g, '');

  if (text === '') return null;
  if (!/^[\d.,]+$/.test(text)) return null;

  const integerPart = extractIntegerPart(text);
  if (integerPart === null) return null;

  const value = BigInt(integerPart.digits) + (integerPart.roundUp ? 1n : 0n);
  if (value === 0n) return null; // ô "0" / "0.00" nghĩa là cột này không có giá trị

  return negative ? -value : value;
}

/**
 * Tách phần nguyên khỏi phần thập phân, trả về chuỗi chữ số và cờ làm tròn.
 */
function extractIntegerPart(text: string): { digits: string; roundUp: boolean } | null {
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  const lastSeparator = Math.max(lastDot, lastComma);

  if (lastSeparator === -1) {
    return /^\d+$/.test(text) ? { digits: text, roundUp: false } : null;
  }

  const separator = lastSeparator === lastDot ? '.' : ',';
  const tail = text.slice(lastSeparator + 1);
  const head = text.slice(0, lastSeparator);

  // Số lần xuất hiện của dấu này. Nếu > 1 thì nó là phân tách nghìn, không thể
  // là thập phân ("1.234.567").
  const occurrences = text.split(separator).length - 1;

  const isDecimal = occurrences === 1 && tail.length >= 1 && tail.length <= 2;

  if (!isDecimal) {
    const digits = text.replace(/[.,]/g, '');
    return /^\d+$/.test(digits) ? { digits, roundUp: false } : null;
  }

  const digits = head.replace(/[.,]/g, '');
  if (!/^\d+$/.test(digits) || !/^\d+$/.test(tail)) return null;

  // '5' → 0.5 ; '50' → 0.50 ; '49' → 0.49
  const fraction = tail.length === 1 ? Number(tail) / 10 : Number(tail) / 100;

  return { digits: digits === '' ? '0' : digits, roundUp: fraction >= 0.5 };
}

/**
 * Parse ngày thành 'YYYY-MM-DD' — chuỗi, KHÔNG phải Date.
 *
 * Cố tình không dùng `new Date()` hay date-fns ở đây: cột DB là DATE (ngày lịch)
 * nên mọi bước trung gian qua Date đều mở lại đúng lớp bug timezone mà ADR 9.5
 * đã đóng. Máy chạy ở múi giờ âm sẽ làm `new Date('2026-07-31')` rồi
 * `getDate()` ra 30.
 */
export function parseStatementDate(
  raw: string | null | undefined,
  format: string,
): string | null {
  if (raw === null || raw === undefined) return null;

  const text = String(raw).trim();
  if (text === '') return null;

  // Lấy 3 nhóm số đầu tiên; bỏ phần giờ nếu ô có kèm ("15/07/2026 14:30")
  const match = text.match(/^(\d{1,4})[^\d](\d{1,2})[^\d](\d{2,4})/);
  if (!match) return null;

  const order = dateFieldOrder(format);
  if (!order) return null;

  const parts: Record<'D' | 'M' | 'Y', number> = { D: 0, M: 0, Y: 0 };
  for (let i = 0; i < 3; i += 1) {
    const key = order[i];
    const value = match[i + 1];
    if (!key || value === undefined) return null;
    parts[key] = Number(value);
  }

  const year = normalizeYear(parts.Y);
  if (year === null) return null;

  return buildDateOnly(year, parts.M, parts.D);
}

/** 'DD/MM/YYYY' → ['D','M','Y'] */
function dateFieldOrder(format: string): Array<'D' | 'M' | 'Y'> | null {
  const letters = format.toUpperCase().replace(/[^DMY]/g, '');
  const order: Array<'D' | 'M' | 'Y'> = [];

  for (const char of letters) {
    const key = char as 'D' | 'M' | 'Y';
    if (!order.includes(key)) order.push(key);
  }

  return order.length === 3 ? order : null;
}

/**
 * Năm 2 chữ số: mốc 70. Sao kê ngân hàng cá nhân không có giao dịch từ thập
 * niên 1900, nhưng chọn mốc vẫn tốt hơn mặc định ngầm 19xx của một số thư viện.
 */
function normalizeYear(value: number): number | null {
  if (value >= 1000) return value;
  if (value < 100) return value < 70 ? 2000 + value : 1900 + value;
  return null;
}

/**
 * Ghép và kiểm tra ngày có thật. Dùng UTC để việc kiểm tra không phụ thuộc múi
 * giờ của máy chạy.
 */
function buildDateOnly(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!valid) return null;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Chuẩn hoá tên cột header để so khớp: bỏ dấu, bỏ khoảng trắng và dấu câu,
 * lowercase. Nhờ đó 'Ngày giao dịch', 'NGAY GIAO DICH', 'Ngay_giao_dich' đều
 * khớp cùng một alias.
 */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
