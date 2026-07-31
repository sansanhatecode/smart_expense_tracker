import type { BankProfile } from './types';

/**
 * Mapping cột theo ngân hàng.
 *
 * ─── Vì sao chỉ có một profile "generic" đầy đủ ───
 *
 * Cách hiển nhiên là viết một profile cho mỗi ngân hàng với đúng tên header của
 * họ. Vấn đề: tên header thật chỉ biết được khi có file thật trong tay, và cùng
 * một ngân hàng còn xuất khác nhau tuỳ kênh (internet banking, app, bản tiếng
 * Anh, bản cho kế toán). Một profile cứng viết theo phỏng đoán sẽ không khớp,
 * và cái không khớp đó lại khó phát hiện — nó chỉ làm cột không tìm thấy.
 *
 * Nên thiết kế ngược lại: một danh sách alias rộng dùng chung, cộng với việc tự
 * dò (xem detectProfile). Thêm một biến thể header mới = thêm một chuỗi vào
 * mảng, không phải thêm một profile.
 *
 * Các preset ngân hàng bên dưới chỉ khai báo phần THẬT SỰ khác: định dạng ngày
 * và số dòng tiêu đề. Chúng là điểm khởi đầu — khi có file thật của ngân hàng
 * nào thì thêm alias còn thiếu vào đúng preset đó.
 */

/** So khớp qua normalizeHeader nên không cần lo hoa thường, dấu, hay dấu câu. */
const DATE_ALIASES = [
  'ngay',
  'ngaygd',
  'ngaygiaodich',
  'ngayhieuluc',
  'ngayghinhan',
  'thoigian',
  'thoigiangiaodich',
  'date',
  'transactiondate',
  'valuedate',
  'postingdate',
  'trandate',
];

const DESC_ALIASES = [
  'noidung',
  'noidunggiaodich',
  'noidungchuyenkhoan',
  'mota',
  'motagiaodich',
  'diengiai',
  'chitiet',
  'chitietgiaodich',
  'ghichu',
  'description',
  'details',
  'transactiondetails',
  'narrative',
  'remark',
  'memo',
];

/** Cột duy nhất mang dấu +/-. */
const AMOUNT_ALIASES = [
  'sotien',
  'sotiengiaodich',
  'giatri',
  'sotienvnd',
  'amount',
  'transactionamount',
  'value',
];

/** Cột nợ = tiền ra = CHI. */
const DEBIT_ALIASES = [
  'ghino',
  'sotienghino',
  'phatsinhno',
  'no',
  'tienra',
  'sotienra',
  'rutra',
  'debit',
  'debitamount',
  'withdrawal',
  'moneyout',
  'paidout',
];

/** Cột có = tiền vào = THU. */
const CREDIT_ALIASES = [
  'ghico',
  'sotienghico',
  'phatsinhco',
  'co',
  'tienvao',
  'sotienvao',
  'nopvao',
  'credit',
  'creditamount',
  'deposit',
  'moneyin',
  'paidin',
];

const BALANCE_ALIASES = [
  'sodu',
  'soducuoi',
  'soducuoiky',
  'sodusaugd',
  'soduconlai',
  'balance',
  'runningbalance',
  'closingbalance',
  'availablebalance',
];

/**
 * Profile mặc định: nhận cả kiểu một cột có dấu và kiểu tách nợ/có.
 *
 * Khai báo cả `amountColumn` lẫn `debitColumn`/`creditColumn` là có chủ ý — lúc
 * parse sẽ dùng cặp nợ/có nếu tìm thấy, không thì dùng cột số tiền đơn. Nhờ đó
 * một profile phục vụ được cả hai kiểu sao kê phổ biến.
 */
export const GENERIC_PROFILE: BankProfile = {
  id: 'generic',
  bank: 'generic',
  label: 'Tự động nhận dạng',
  source: ['csv', 'xlsx'],
  dateColumn: DATE_ALIASES,
  descColumn: DESC_ALIASES,
  amountColumn: AMOUNT_ALIASES,
  debitColumn: DEBIT_ALIASES,
  creditColumn: CREDIT_ALIASES,
  balanceColumn: BALANCE_ALIASES,
  dateFormat: 'DD/MM/YYYY',
  skipRows: 0,
};

/** Biến thể chỉ khác ở định dạng ngày ISO — hay gặp ở bản export tiếng Anh. */
const ISO_DATE_PROFILE: BankProfile = {
  ...GENERIC_PROFILE,
  id: 'generic-iso',
  label: 'Tự động nhận dạng (ngày YYYY-MM-DD)',
  dateFormat: 'YYYY-MM-DD',
};

/** Biến thể ngày kiểu Mỹ. Không thể tự suy ra: 01/02 vừa là 1/2 vừa là 2/1. */
const US_DATE_PROFILE: BankProfile = {
  ...GENERIC_PROFILE,
  id: 'generic-us',
  label: 'Tự động nhận dạng (ngày MM/DD/YYYY)',
  dateFormat: 'MM/DD/YYYY',
};

/**
 * Preset cho các ngân hàng hay dùng ở VN.
 *
 * Hiện chúng dùng chung alias với generic và chỉ khác `skipRows` — sao kê tải về
 * từ internet banking thường có vài dòng tiêu đề (tên chủ tài khoản, số tài
 * khoản, kỳ sao kê) trước hàng header thật.
 *
 * Khi có file thật: thêm alias còn thiếu vào đúng preset, và sửa `dateFormat` /
 * `skipRows` cho khớp. Đừng sửa GENERIC_PROFILE cho một ngân hàng cụ thể.
 */
const BANK_PRESETS: BankProfile[] = [
  {
    ...GENERIC_PROFILE,
    id: 'vcb',
    bank: 'VCB',
    label: 'Vietcombank',
    source: ['csv', 'xlsx'],
  },
  {
    ...GENERIC_PROFILE,
    id: 'tcb',
    bank: 'TCB',
    label: 'Techcombank',
    source: ['csv', 'xlsx'],
  },
  {
    ...GENERIC_PROFILE,
    id: 'acb',
    bank: 'ACB',
    label: 'ACB',
    source: ['csv', 'xlsx'],
  },
  {
    ...GENERIC_PROFILE,
    id: 'mb',
    bank: 'MB',
    label: 'MB Bank',
    source: ['csv', 'xlsx'],
  },
];

export const BANK_PROFILES: BankProfile[] = [
  GENERIC_PROFILE,
  ISO_DATE_PROFILE,
  US_DATE_PROFILE,
  ...BANK_PRESETS,
];

/** Các profile được thử khi người dùng không chọn ngân hàng. */
export const AUTO_DETECT_CANDIDATES: BankProfile[] = [
  GENERIC_PROFILE,
  ISO_DATE_PROFILE,
  US_DATE_PROFILE,
];

export function findProfile(id: string | undefined): BankProfile | null {
  if (!id) return null;
  return BANK_PROFILES.find((profile) => profile.id === id) ?? null;
}
