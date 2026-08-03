import { parseMcc } from './mcc';
import {
  isCardBillPayment,
  isFailedStatus,
  normalizeHeader,
  parseStatementAmount,
  parseStatementDate,
} from './parse-value';
import type { BankProfile, ParseResult, RawTransaction, SkippedRow } from './types';

/**
 * Đọc một bảng 2 chiều thành RawTransaction[].
 *
 * Dùng chung cho CSV và XLSX: khác biệt duy nhất giữa hai định dạng là cách lấy
 * ra bảng, còn việc tìm hàng header, nhận cột, và đọc từng dòng thì giống hệt.
 * Tách ra đây để thêm định dạng mới (PDF) chỉ cần viết phần lấy bảng.
 *
 * Điểm cần chú ý: CSV cho mọi ô là string, còn XLSX cho số là `number` và ngày là
 * `Date`. Nên mọi hàm đọc ô ở đây phải nhận cả ba, và đó là lý do có coerceDate/
 * coerceAmount thay vì gọi thẳng parseStatement*.
 */

export type Cell = string | number | boolean | Date | null | undefined;

interface ResolvedColumns {
  date: number;
  desc: number;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  mcc: number | null;
  status: number | null;
}

export function parseTable(
  table: Cell[][],
  profile: BankProfile,
): ParseResult {
  const rowsWithContent = table.filter(
    (row) => Array.isArray(row) && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''),
  );

  if (rowsWithContent.length === 0) {
    return { rows: [], skipped: [], profileId: profile.id };
  }

  const headerIndex = findHeaderRow(rowsWithContent, profile);

  if (headerIndex === null) {
    return {
      rows: [],
      skipped: [
        {
          rowIndex: 0,
          raw: rowToRaw(rowsWithContent[0] ?? []),
          reason:
            'Không tìm thấy hàng tiêu đề có cột ngày và số tiền. ' +
            'Hãy kiểm tra lại file, hoặc chọn đúng ngân hàng ở bước upload.',
        },
      ],
      profileId: profile.id,
    };
  }

  const headers = (rowsWithContent[headerIndex] ?? []).map((cell) =>
    normalizeHeader(String(cell ?? '')),
  );
  const columns = resolveColumns(headers, profile);

  if (!columns) {
    return {
      rows: [],
      skipped: [
        {
          rowIndex: headerIndex,
          raw: rowToRaw(rowsWithContent[headerIndex] ?? []),
          reason: 'Hàng tiêu đề thiếu cột ngày, nội dung, hoặc số tiền.',
        },
      ],
      profileId: profile.id,
    };
  }

  const rows: RawTransaction[] = [];
  const skipped: SkippedRow[] = [];

  for (let i = headerIndex + 1; i < rowsWithContent.length; i += 1) {
    const cells = rowsWithContent[i];
    if (!cells) continue;

    const outcome = parseRow(cells, columns, profile, rows.length);

    if ('reason' in outcome) {
      // Dòng tổng cộng / chữ ký / ghi chú cuối file là chuyện thường, và một dòng
      // như thế không được làm hỏng cả lần import. Thu lại để báo ở preview.
      skipped.push({
        rowIndex: i - headerIndex - 1,
        raw: rowToRaw(cells),
        reason: outcome.reason,
      });
      continue;
    }

    rows.push(outcome);
  }

  return { rows, skipped, profileId: profile.id };
}

function rowToRaw(cells: Cell[]): string {
  return cells.map((cell) => (cell === null || cell === undefined ? '' : String(cell))).join(' | ');
}

/**
 * Tìm hàng tiêu đề thật bằng NỘI DUNG, không tin `profile.skipRows`.
 *
 * Số dòng tiêu đề của cùng một ngân hàng thay đổi theo kỳ sao kê (có kỳ thêm dòng
 * "Số dư đầu kỳ"), nên skipRows chỉ là điểm bắt đầu tìm. Hàng header là hàng đầu
 * tiên nhận ra được đủ cột cần thiết.
 */
function findHeaderRow(table: Cell[][], profile: BankProfile): number | null {
  const start = Math.min(profile.skipRows, Math.max(0, table.length - 1));

  for (let i = start; i < Math.min(table.length, start + 30); i += 1) {
    const headers = (table[i] ?? []).map((cell) => normalizeHeader(String(cell ?? '')));
    if (resolveColumns(headers, profile)) return i;
  }

  return null;
}

function indexOfAlias(headers: string[], aliases: string[] | undefined): number | null {
  if (!aliases) return null;

  // Khớp chính xác trước — an toàn hơn khớp một phần.
  for (const alias of aliases) {
    const exact = headers.indexOf(alias);
    if (exact !== -1) return exact;
  }

  // Rồi mới khớp một phần, cho header kiểu 'ngaygiaodichddmmyyyy'. Chỉ nhận alias
  // đủ dài: 'no'/'co' khớp một phần sẽ trúng cả 'noidung'.
  for (const alias of aliases) {
    if (alias.length < 5) continue;
    const partial = headers.findIndex((header) => header.includes(alias));
    if (partial !== -1) return partial;
  }

  return null;
}

function resolveColumns(headers: string[], profile: BankProfile): ResolvedColumns | null {
  const date = indexOfAlias(headers, profile.dateColumn);
  const desc = indexOfAlias(headers, profile.descColumn);
  const debit = indexOfAlias(headers, profile.debitColumn);
  const credit = indexOfAlias(headers, profile.creditColumn);
  const amount = indexOfAlias(headers, profile.amountColumn);
  const balance = indexOfAlias(headers, profile.balanceColumn);
  const mcc = indexOfAlias(headers, profile.mccColumn);
  const status = indexOfAlias(headers, profile.statusColumn);

  if (date === null || desc === null) return null;
  if (debit === null && credit === null && amount === null) return null;

  // `status` và `mcc` không nằm trong điều kiện trên: thiếu chúng chỉ nghĩa là
  // file không nói gì về trạng thái / ngành nghề điểm bán, không phải là không
  // nhận ra được bảng. Sao kê tài khoản thanh toán không bao giờ có cột MCC.
  return { date, desc, amount, debit, credit, balance, mcc, status };
}

function cellAt(cells: Cell[], index: number | null): Cell {
  if (index === null) return null;
  return cells[index] ?? null;
}

function parseRow(
  cells: Cell[],
  columns: ResolvedColumns,
  profile: BankProfile,
  rowIndex: number,
): RawTransaction | { reason: string } {
  // Kiểm tra trạng thái TRƯỚC ngày và số tiền: một giao dịch thất bại vẫn có đủ
  // ngày và số tiền hợp lệ, nên nếu để sau thì nó vào thẳng danh sách import.
  // Ví điện tử (MoMo) xuất cả những dòng này, và tiền của chúng không hề chuyển.
  const statusCell = cellAt(cells, columns.status);
  if (statusCell !== null && isFailedStatus(String(statusCell))) {
    return { reason: `Giao dịch không thành công (trạng thái "${String(statusCell).trim()}")` };
  }

  const dateCell = cellAt(cells, columns.date);
  const date = coerceDate(dateCell, profile.dateFormat);

  if (!date) {
    const text = dateCell === null ? '' : String(dateCell).trim();
    return {
      reason: text
        ? `Không đọc được ngày "${text}" theo định dạng ${profile.dateFormat}`
        : 'Thiếu ngày giao dịch',
    };
  }

  const descCell = cellAt(cells, columns.desc);
  const description = descCell === null ? '' : String(descCell).trim();
  if (description === '') {
    return { reason: 'Thiếu nội dung giao dịch' };
  }

  const amount = resolveAmount(cells, columns);
  if (amount === null) {
    return { reason: 'Không đọc được số tiền, hoặc số tiền bằng 0' };
  }

  /**
   * Bỏ khoản trả nợ thẻ tín dụng — nhưng CHỈ khi nó là tiền vào.
   *
   * Chiều tiền là thứ phân biệt hai mặt của cùng một giao dịch, và bỏ nhầm mặt
   * kia sẽ xoá mất tiền thật:
   *
   *   Sao kê THẺ — khoản này là tiền VÀO (ghi có, làm giảm dư nợ). Bỏ đi là
   *   đúng: mọi đồng đã tiêu nằm ở các dòng mua hàng ngay phía trên trong cùng
   *   file, giữ lại dòng này thì nó thành một khoản thu không có thật.
   *
   *   Sao kê TÀI KHOẢN THANH TOÁN — cũng khoản đó nhưng là tiền RA. Phải giữ:
   *   nếu người dùng chỉ import sao kê ngân hàng mà không import sao kê thẻ thì
   *   đây là dấu vết DUY NHẤT của số tiền đã tiêu bằng thẻ. Bỏ nó đi là làm chi
   *   tiêu của họ bốc hơi.
   */
  if (amount > 0n && isCardBillPayment(description)) {
    return {
      reason:
        'Thanh toán sao kê thẻ tín dụng — tiền trả nợ thẻ, không phải thu nhập. ' +
        'Các khoản đã tiêu nằm ở những dòng mua hàng trong cùng sao kê.',
    };
  }

  return {
    date,
    amount,
    description,
    balance: coerceAmount(cellAt(cells, columns.balance)),
    mcc: parseMcc(cellAt(cells, columns.mcc)),
    raw: rowToRaw(cells),
    rowIndex,
  };
}

/**
 * Nợ = tiền ra = chi = âm.
 *
 * Cặp nợ/có được ưu tiên hơn cột số tiền đơn: có ngân hàng xuất số dương ở cả hai
 * chiều trong cột "số tiền", và tin vào nó sẽ biến mọi khoản chi thành khoản thu.
 */
function resolveAmount(cells: Cell[], columns: ResolvedColumns): bigint | null {
  const debit = coerceAmount(cellAt(cells, columns.debit));
  const credit = coerceAmount(cellAt(cells, columns.credit));

  if (debit !== null && credit !== null) {
    // Cả hai cột đều có số là dữ liệu mâu thuẫn — không đoán.
    return null;
  }
  if (debit !== null) return -abs(debit);
  if (credit !== null) return abs(credit);

  return coerceAmount(cellAt(cells, columns.amount));
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/** Đọc ô thành số nguyên VND. CSV cho string, XLSX cho number. */
export function coerceAmount(cell: Cell): bigint | null {
  if (cell === null || cell === undefined) return null;

  if (typeof cell === 'number') {
    if (!Number.isFinite(cell) || cell === 0) return null;
    // VND không có đơn vị nhỏ hơn đồng; Excel có thể lưu 50000.0000001
    return BigInt(Math.round(cell));
  }

  if (typeof cell === 'boolean' || cell instanceof Date) return null;

  return parseStatementAmount(String(cell));
}

/** Mốc epoch của Excel. 1899-12-30 chứ không phải 1900-01-01, do bug năm nhuận 1900. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/**
 * Đọc ô thành 'YYYY-MM-DD'.
 *
 * Ba dạng phải xử lý:
 *   Date    — XLSX với ô đã định dạng ngày; read-excel-file trả Date ở UTC midnight
 *   number  — ô ngày CHƯA định dạng (Excel serial), hoặc số kiểu 20260715
 *   string  — CSV, hoặc ô XLSX lưu dạng text
 */
export function coerceDate(cell: Cell, format: string): string | null {
  if (cell === null || cell === undefined) return null;

  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    // Dùng getUTC* vì read-excel-file dựng Date ở UTC midnight — getFullYear()
    // trên máy múi giờ âm sẽ ra ngày hôm trước.
    return formatUtcDate(cell);
  }

  if (typeof cell === 'number') {
    if (!Number.isFinite(cell)) return null;

    // Dạng YYYYMMDD dạng số, gặp ở một số bản export
    if (cell >= 19_000_101 && cell <= 29_991_231 && Number.isInteger(cell)) {
      const year = Math.floor(cell / 10_000);
      const month = Math.floor((cell % 10_000) / 100);
      const day = cell % 100;
      return buildDate(year, month, day);
    }

    // Excel serial: 1 ≈ 1900-01-01, 46000 ≈ 2025
    if (cell > 0 && cell < 100_000) {
      // floor, KHÔNG round: phần thập phân của serial là giờ trong ngày, và ô
      // "Thời gian" của MoMo có giờ. Làm tròn thì mọi giao dịch sau 12:00 trưa
      // nhảy sang ngày hôm sau — sai lệch mà không dòng nào bị báo lỗi.
      const date = new Date(EXCEL_EPOCH_UTC + Math.floor(cell) * 86_400_000);
      return formatUtcDate(date);
    }

    return null;
  }

  if (typeof cell === 'boolean') return null;

  return parseStatementDate(String(cell), format);
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return valid ? formatUtcDate(date) : null;
}
