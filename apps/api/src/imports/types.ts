import type { ImportSource } from '@expense/shared';
import type { TxType } from '../generated/prisma/enums';

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
  supports(file: UploadedFile): boolean;
  /** Async vì thư viện đọc .xlsx là async; CsvParser chỉ trả promise đã resolve. */
  parse(file: UploadedFile, profile: BankProfile): Promise<ParseResult>;
}
