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

/**
 * Thứ tự trong mảng này có ý nghĩa: khớp chính xác được thử theo đúng thứ tự,
 * nên alias đứng trước thắng khi file có nhiều cột mô tả.
 *
 * 'loaigiaodich' xếp CUỐI là có chủ ý. Với sao kê ngân hàng, "Loại giao dịch"
 * thường chỉ là nhãn kỹ thuật ('Chuyển khoản', 'Thanh toán') còn nội dung thật
 * nằm ở "Nội dung"/"Diễn giải" — nên nó chỉ được dùng khi không có cột nào tốt
 * hơn. Với MoMo thì đây lại là cột duy nhất mang nội dung, xem MOMO_PROFILE.
 */
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
  'loaigiaodich',
  'loaigd',
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
  // 'sodusau' đủ dài để khớp một phần, nên nó bắt luôn 'sodusaugiaodich' của MoMo
  'sodusau',
  'sodusaugd',
  'soduconlai',
  'balance',
  'runningbalance',
  'closingbalance',
  'availablebalance',
];

/**
 * Cột MCC của sao kê thẻ tín dụng.
 *
 * 'mcc' đứng đầu và chỉ khớp CHÍNH XÁC — indexOfAlias bỏ qua alias ngắn hơn 5
 * ký tự ở vòng khớp một phần, nên nó không thể vô tình trúng một header khác có
 * chứa ba chữ cái này.
 *
 * KHÔNG thêm 'manganh': nó khớp một phần với 'manganhang' ("Mã ngân hàng"), một
 * cột hoàn toàn khác mà nhiều sao kê có. Alias cho cột MCC phải đủ dài để không
 * đụng vào nó.
 *
 * 'mccmcc' không phải lỗi gõ. Sao kê thẻ hay in header song ngữ trên hai dòng
 * trong CÙNG một ô ('Ngày giao dịch' / 'Transaction date'), và với cột MCC thì
 * cả hai dòng đều là "MCC" — normalizeHeader bỏ xuống dòng nên ô đó thành
 * 'mccmcc'. Không có alias này thì cột MCC của một sao kê Mastercard thật không
 * được nhận ra, mà lại không có lỗi nào báo: file vẫn import trọn vẹn, chỉ là
 * không dòng nào được phân loại theo MCC.
 */
const MCC_ALIASES = [
  'mcc',
  'mccmcc',
  'mamcc',
  'mcccode',
  'manganhhang',
  'nganhhang',
  'nhomnganh',
  'nhomnganhhang',
  'loaihinhkinhdoanh',
  'merchantcategorycode',
  'merchantcategory',
  'categorycode',
];

/** Cột trạng thái. Chỉ dùng để BỎ dòng thất bại, không ảnh hưởng nhận cột khác. */
const STATUS_ALIASES = [
  'trangthai',
  'trangthaigd',
  'trangthaigiaodich',
  'tinhtrang',
  'tinhtranggiaodich',
  'status',
  'transactionstatus',
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
  mccColumn: MCC_ALIASES,
  statusColumn: STATUS_ALIASES,
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
 * MoMo — ví điện tử, không phải ngân hàng, nên file của nó khác thật ở ba điểm:
 *
 *   1. Nội dung nằm ở "Loại giao dịch". Ở đây nó là cột duy nhất mang nội dung
 *      ("Nhận từ LUU KHANH LINH", "Nạp tiền điện thoại Viettel"), nên phải xếp
 *      ĐẦU danh sách alias. Với profile generic nó xếp cuối, và một file MoMo có
 *      thêm cột "Ghi chú" để trống sẽ làm generic chọn đúng cột trống đó rồi bỏ
 *      sạch mọi dòng vì "Thiếu nội dung giao dịch".
 *   2. Có cột "Trạng Thái GD" và file chứa cả giao dịch KHÔNG thành công.
 *   3. Cột "Thời gian" là ngày KÈM GIỜ ('03/08/2026 02:21:01').
 *
 * Không khai báo debit/credit: MoMo chỉ có một cột "Số Tiền" mang dấu, và bỏ
 * trống hai field này chặn luôn khả năng một cột khác lỡ khớp alias nợ/có.
 */
const MOMO_PROFILE: BankProfile = {
  ...GENERIC_PROFILE,
  id: 'momo',
  bank: 'MoMo',
  label: 'MoMo (ví điện tử)',
  source: ['csv', 'xlsx'],
  descColumn: ['loaigiaodich', 'loaigd', ...DESC_ALIASES],
  amountColumn: AMOUNT_ALIASES,
  debitColumn: undefined,
  creditColumn: undefined,
  balanceColumn: ['sodusaugiaodich', 'sodusau', ...BALANCE_ALIASES],
  statusColumn: STATUS_ALIASES,
  // Sao kê ngân hàng hiếm khi có ĐỒNG THỜI cột "Loại giao dịch" và "Trạng thái
  // GD"; MoMo luôn có cả hai. Đòi đủ cả hai thay vì một, để một file ngân hàng
  // lỡ có cột trạng thái không bị nhận nhầm thành ví.
  signatureColumns: ['loaigiaodich', 'trangthaigd'],
  dateFormat: 'DD/MM/YYYY',
  skipRows: 0,
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
  MOMO_PROFILE,
  ...BANK_PRESETS,
];

/**
 * Các profile được thử khi người dùng không chọn ngân hàng.
 *
 * MoMo nằm trong danh sách vì file của nó đặt nội dung ở một cột mà generic chỉ
 * coi là lựa chọn cuối — người dùng không nên phải biết điều đó để up được file.
 * Nó xếp cuối nên chỉ thắng khi các profile trước đọc được ít dòng hơn, và vòng
 * lặp đã dừng sớm ở profile đầu tiên đọc trọn file nên chi phí thường là 0.
 */
export const AUTO_DETECT_CANDIDATES: BankProfile[] = [
  GENERIC_PROFILE,
  ISO_DATE_PROFILE,
  US_DATE_PROFILE,
  MOMO_PROFILE,
];

export function findProfile(id: string | undefined): BankProfile | null {
  if (!id) return null;
  return BANK_PROFILES.find((profile) => profile.id === id) ?? null;
}
