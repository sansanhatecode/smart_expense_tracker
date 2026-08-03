import type { ImportSource } from '@expense/shared';
import type { InternalKind, TxType } from '../generated/prisma/enums';

/**
 * Điều mà file sao kê cung cấp — `amount` CÓ DẤU, vì đó là dạng gốc.
 * Chuyển sang dạng DB (amount dương + type) là việc của Normalizer.
 */
export interface RawTransaction {
  /** 'YYYY-MM-DD'. Parser đã chuẩn hoá, không để lại chuỗi ngày của bank. */
  date: string;
  /** Số nguyên VND, âm = chi, dương = thu. */
  amount: bigint;
  description: string;
  balance: bigint | null;
  /**
   * Mã ngành nghề điểm bán, 4 chữ số, CHỈ có ở sao kê thẻ có cột MCC. Sao kê
   * ghi MCC trong phần mô tả được xử lý ở Normalizer, không phải ở đây.
   */
  mcc: string | null;
  /** Dòng gốc, giữ để đối chiếu khi parse sai. */
  raw: string;
  /** Thứ tự trong file, để preview hiện đúng thứ tự người dùng thấy. */
  rowIndex: number;
}

/** Dạng đi vào DB: amount luôn dương, chiều nằm ở `type`. */
export interface NormalizedTransaction {
  date: string;
  amount: bigint;
  type: TxType;
  description: string;
  /** Mô tả đã qua normalizeDescription, dùng cho dedupe và categorize. */
  normalizedDescription: string;
  balance: bigint | null;
  /** MCC lấy từ cột riêng, hoặc rút từ mô tả nếu sao kê nhúng nó vào đó. */
  mcc: string | null;
  /**
   * Khác null = tiền dịch chuyển giữa các nguồn của chính người dùng, không
   * phải chi tiêu/thu nhập thật. Xem `classifyInternal` trong normalizer.
   */
  internalKind: InternalKind | null;
  raw: string;
  rowIndex: number;
}

/**
 * Dòng parser không đọc được. Cố tình KHÔNG ném lỗi khi gặp một dòng lỗi:
 * một dòng rác ở cuối file (dòng tổng, chữ ký, ghi chú) không được làm hỏng
 * cả lần import. Chúng được thu lại và báo cho người dùng ở bước preview.
 */
export interface SkippedRow {
  rowIndex: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  rows: RawTransaction[];
  skipped: SkippedRow[];
  /** Profile thực sự được dùng, sau khi dò. */
  profileId: string;
  /** File có đủ các cột trong `signatureColumns` của profile không. */
  signatureMatched: boolean;
}

/**
 * Mapping cột theo ngân hàng.
 *
 * Mỗi field cột là một MẢNG alias, không phải một tên duy nhất: cùng một ngân
 * hàng xuất file với header khác nhau tuỳ kênh (internet banking, app, bản
 * tiếng Anh), và giữ danh sách alias rẻ hơn nhiều so với thêm một profile mới
 * cho mỗi biến thể. So khớp không phân biệt hoa thường và không phân biệt dấu.
 */
export interface BankProfile {
  id: string;
  bank: string;
  /** Tên hiển thị cho dropdown chọn ngân hàng ở FE. */
  label: string;
  source: ImportSource[];

  dateColumn: string[];
  descColumn: string[];

  /** Một cột duy nhất mang dấu +/-. Loại trừ với debit/credit. */
  amountColumn?: string[];
  /** Hoặc tách hai cột nợ (chi) / có (thu). */
  debitColumn?: string[];
  creditColumn?: string[];

  balanceColumn?: string[];

  /**
   * Cột MCC của sao kê thẻ tín dụng, nếu file có. Thiếu nó không ảnh hưởng gì
   * tới việc nhận bảng — sao kê tài khoản thanh toán vốn không có cột này.
   */
  mccColumn?: string[];

  /**
   * Cột trạng thái giao dịch, nếu file có. Dòng nào trạng thái nói rõ là thất
   * bại / bị huỷ / đang xử lý thì bị bỏ — ví điện tử (MoMo) xuất cả những dòng
   * này, và tiền của chúng chưa bao giờ chuyển đi.
   */
  statusColumn?: string[];

  /**
   * Cột PHẢI có mặt thì profile này mới coi là "nhận ra" file.
   *
   * Tồn tại vì số dòng đọc được không đủ để phân biệt: profile generic đọc trọn
   * một file MoMo y như profile MoMo, và vì generic được thử trước nên nó luôn
   * thắng khi hoà. Trước đây điều đó vô hại — hai profile cho cùng kết quả. Giờ
   * thì không: loại nguồn tiền suy ra TỪ profile, nên file MoMo bị xếp thành tài
   * khoản ngân hàng, gộp chung với ngân hàng thật và khoản nạp ví thành thu nhập.
   *
   * Chữ ký chỉ phá thế hoà, KHÔNG lấn số dòng: một profile đọc được nhiều dòng
   * hơn vẫn thắng, vì đọc sót dữ liệu tệ hơn là gọi sai tên nguồn tiền.
   */
  signatureColumns?: string[];

  /** 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM/DD/YYYY' | 'DD/MM/YY' */
  dateFormat: string;

  /** Số dòng tiêu đề sao kê cần bỏ trước khi tới hàng header. */
  skipRows: number;

  /**
   * Mã tham chiếu biến động giữa các lần export. Nếu có, phải strip trước khi
   * tính dedupe hash — nếu không thì cùng một giao dịch sẽ ra hash khác nhau ở
   * hai lần export và dedupe mất tác dụng.
   */
  stripPattern?: RegExp;
}

export interface UploadedFile {
  originalName: string;
  buffer: Buffer;
  mimeType: string;
  size: number;
}

export interface StatementParser {
  readonly source: ImportSource;
  /** Async vì thư viện đọc .xlsx là async; CsvParser chỉ trả promise đã resolve. */
  parse(file: UploadedFile, profile: BankProfile): Promise<ParseResult>;
}

/**
 * Cố tình KHÔNG có `supports(file)`.
 *
 * Phiên bản đầu có, và nó nhận dạng bằng đuôi tên file — nên một file .xls đặt
 * tên .xlsx đi thẳng vào XlsxParser rồi nổ ở tầng thư viện. Việc nhận định dạng
 * giờ do `detectFormat` làm, dựa trên magic bytes; parser chỉ còn việc đọc.
 */
