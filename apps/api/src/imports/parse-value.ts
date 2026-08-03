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

/** Bỏ dấu, bỏ mọi thứ không phải chữ/số, lowercase. */
function compact(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Chuẩn hoá tên cột header để so khớp: bỏ dấu, bỏ khoảng trắng và dấu câu,
 * lowercase. Nhờ đó 'Ngày giao dịch', 'NGAY GIAO DICH', 'Ngay_giao_dich' đều
 * khớp cùng một alias.
 */
export function normalizeHeader(header: string): string {
  return compact(header);
}

/**
 * Các trạng thái CHẮC CHẮN là không thành công.
 *
 * So khớp trên chuỗi đã compact, nên phải tránh mảnh quá ngắn: 'huy' nằm trong
 * 'chuyen', nên chỉ nhận 'dahuy' / 'bihuy' / 'huybo'.
 */
const FAILED_STATUS_MARKERS = [
  'thatbai',
  'khongthanhcong',
  'tuchoi',
  'dahuy',
  'bihuy',
  'huybo',
  'dangxuly',
  'choxuly',
  'chuaxuly',
  'fail',
  'unsuccessful',
  'reject',
  'cancel',
  'pending',
  'decline',
  'expire',
  'reverse',
  'timeout',
  'error',
];

/**
 * Ô "Trạng thái GD" có nói rằng giao dịch này KHÔNG thành công không?
 *
 * Cố tình hỏi ngược lại thay vì "có phải thành công không". Danh sách chữ chỉ
 * trạng thái thành công là vô hạn ('Thành công', 'Đã hoàn thành', 'Success',
 * 'Successful', 'Hoàn tất'…), nên đòi phải khớp whitelist thì một cách viết lạ
 * sẽ làm BỎ SẠCH mọi dòng của file — thiệt hại lớn hơn nhiều so với việc lỡ giữ
 * lại một dòng thất bại, thứ mà người dùng còn thấy và bỏ tick được ở preview.
 */
export function isFailedStatus(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return false;

  const text = compact(String(raw));
  if (text === '') return false;

  return FAILED_STATUS_MARKERS.some((marker) => text.includes(marker));
}

/**
 * Cách gọi khoản trả nợ thẻ trên sao kê thẻ tín dụng.
 *
 * Danh sách này cố tình NGẮN và cụ thể. Khớp nhầm ở đây làm biến mất một giao
 * dịch thật khỏi lần import, tệ hơn nhiều so với việc bỏ sót một dòng thanh toán
 * — dòng bỏ sót thì người dùng thấy nó ở preview và bỏ tick được, còn dòng bị
 * xoá nhầm thì họ phải tự phát hiện ra là thiếu.
 *
 * Vì thế KHÔNG có 'thanhtoanthe': "thanh toán thẻ" cũng là cách nói của việc
 * quẹt thẻ mua hàng, tức đúng những giao dịch phải giữ lại.
 */
const CARD_BILL_PAYMENT_MARKERS = [
  'thanhtoansaoke',
  'ttsaoke',
  'thanhtoanduno',
  'thanhtoanthetindung',
  'creditcardpayment',
  'paymentreceived',
  'paymentthankyou',
];

/**
 * Mô tả này có phải là khoản THANH TOÁN SAO KÊ thẻ tín dụng không?
 *
 * Đây là tiền từ tài khoản thanh toán chuyển sang trả nợ thẻ — tiền đổi chỗ giữa
 * hai túi của cùng một người, không phải thu nhập và cũng không phải chi tiêu.
 * Số tiền thật đã được ghi nhận rồi, ở chính các dòng mua hàng phía trên nó.
 *
 * Hàm này CHỈ trả lời về chuỗi mô tả. Dòng này là nội bộ hay không còn phụ thuộc
 * chiều tiền và loại nguồn tiền, và chỗ quyết định là normalizer — xem
 * `classifyInternal` ở đó.
 */
export function isCardBillPayment(raw: string | null | undefined): boolean {
  return matchesAny(raw, CARD_BILL_PAYMENT_MARKERS);
}

/**
 * Cách gọi việc nạp tiền vào ví điện tử.
 *
 * Ngắn và cụ thể vì cùng lý do với danh sách trên. KHÔNG có 'momo' hay
 * 'zalopay' trần: tên ví xuất hiện trong mô tả của mọi khoản THANH TOÁN qua ví
 * ('MOMO Highlands Coffee'), tức đúng những khoản chi thật phải giữ lại.
 */
const WALLET_TOPUP_MARKERS = ['naptienvi', 'naptienvao', 'napvi', 'naptien', 'topup', 'topupwallet'];

export function isWalletTopup(raw: string | null | undefined): boolean {
  return matchesAny(raw, WALLET_TOPUP_MARKERS);
}

/**
 * Chuyển tiền giữa hai tài khoản của chính người dùng.
 *
 * Chỉ nhận những cách viết nói RÕ là nội bộ. Cố tình không đoán từ 'chuyentien'
 * trần — phần lớn khoản chuyển tiền là trả cho người khác, tức chi tiêu thật.
 */
const SELF_TRANSFER_MARKERS = [
  'chuyenkhoannoibo',
  'chuyentiennoibo',
  'chuyentiengiuataikhoan',
  'chuyentiengiuacactaikhoan',
  'internaltransfer',
  'ownaccounttransfer',
];

export function isSelfTransfer(raw: string | null | undefined): boolean {
  return matchesAny(raw, SELF_TRANSFER_MARKERS);
}

/**
 * Cất tiền vào / lấy tiền ra khỏi túi tiết kiệm trong ví điện tử.
 *
 * MoMo gọi túi này là "Túi Thần Tài". Nó là một ngăn khác của cùng cái ví, nên
 * chuyển tiền vào đó không phải chi tiêu — tiền vẫn của người dùng.
 *
 * Vì sao cần luật riêng thay vì để `isWalletTopup` lo: sao kê MoMo ghi CẢ HAI vế
 * của một lần cất tiền, và cả hai đều mang đúng một mô tả "Nạp tiền vào Túi Thần
 * Tài" — một dòng −1.000.000 (rời ví) và một dòng +1.000.000 (vào túi). Luật
 * `wallet_topup` đòi tiền phải VÀO ví, nên nó chỉ bắt được vế thứ hai, và vế đầu
 * thành một khoản chi thật không có. Ở đây chiều tiền không tham gia: tên cái
 * túi đã nói rõ tiền đi đâu, và cả hai chiều đều là nội bộ.
 *
 * Ba điều kiện chứ không phải một, vì hai cái bẫy nằm sát nhau:
 *
 *   Phải có tên túi. Bỏ điều kiện này thì 'Nạp tiền điện thoại Viettel' —
 *   khoản chi thật, cũng là tiền RA khỏi ví — bị loại theo.
 *
 *   Phải có động từ chuyển tiền. Chặn 'Nhận lãi Túi Thần Tài' ngay từ đây.
 *
 *   Và phải KHÔNG phải tiền lãi. Điều kiện thứ hai không đủ vì lãi có thể được
 *   ghi là 'Nhận tiền lãi Túi Thần Tài' — có cả tên túi lẫn 'nhận tiền'. Tiền
 *   lãi là thu nhập THẬT, loại nó đi là ăn bớt thu nhập của người dùng.
 */
const SAVINGS_POCKET_MARKERS = ['tuithantai'];

const POCKET_MOVEMENT_MARKERS = ['naptien', 'ruttien', 'chuyentien', 'nhantien'];

/** Lãi và phần sinh lời của túi — thu nhập thật, không phải tiền đổi chỗ. */
const POCKET_EARNING_MARKERS = ['lai', 'sinhloi'];

export function isSavingsPocketTransfer(raw: string | null | undefined): boolean {
  if (!matchesAny(raw, SAVINGS_POCKET_MARKERS)) return false;
  if (matchesAny(raw, POCKET_EARNING_MARKERS)) return false;

  return matchesAny(raw, POCKET_MOVEMENT_MARKERS);
}

function matchesAny(raw: string | null | undefined, markers: string[]): boolean {
  if (raw === null || raw === undefined) return false;

  const text = compact(String(raw));
  if (text === '') return false;

  return markers.some((marker) => text.includes(marker));
}
