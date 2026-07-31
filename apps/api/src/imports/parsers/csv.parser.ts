import type { ImportSource } from '@expense/shared';
import Papa from 'papaparse';
import {
  normalizeHeader,
  parseStatementAmount,
  parseStatementDate,
} from '../parse-value';
import type {
  BankProfile,
  ParseResult,
  RawTransaction,
  SkippedRow,
  StatementParser,
  UploadedFile,
} from '../types';

/** Cột đã được xác định vị trí trong file cụ thể này. */
interface ResolvedColumns {
  date: number;
  desc: number;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

export class CsvParser implements StatementParser {
  readonly source: ImportSource = 'csv';

  supports(file: UploadedFile): boolean {
    if (/\.csv$/i.test(file.originalName)) return true;
    // Một số nơi trả text/plain cho .csv, nên không tin mimeType một mình.
    return file.mimeType === 'text/csv' || file.mimeType === 'application/csv';
  }

  parse(file: UploadedFile, profile: BankProfile): ParseResult {
    const text = decodeCsv(file.buffer);

    // Để papaparse tự dò delimiter: sao kê VN xuất bằng cả ',' và ';' (Excel
    // vùng dùng dấu phẩy thập phân sẽ dùng ';'), và cả tab.
    const parsed = Papa.parse<string[]>(text, {
      skipEmptyLines: 'greedy',
      delimitersToGuess: [',', ';', '\t', '|'],
    });

    const table = parsed.data.filter((row) => Array.isArray(row) && row.length > 1);

    if (table.length === 0) {
      return { rows: [], skipped: [], profileId: profile.id };
    }

    const headerIndex = findHeaderRow(table, profile);

    if (headerIndex === null) {
      return {
        rows: [],
        skipped: [
          {
            rowIndex: 0,
            raw: table[0]?.join(', ') ?? '',
            reason:
              'Không tìm thấy hàng tiêu đề có cột ngày và số tiền. ' +
              'Hãy kiểm tra file, hoặc chọn đúng ngân hàng ở bước upload.',
          },
        ],
        profileId: profile.id,
      };
    }

    const headers = (table[headerIndex] ?? []).map((cell) => normalizeHeader(String(cell ?? '')));
    const columns = resolveColumns(headers, profile);

    if (!columns) {
      return {
        rows: [],
        skipped: [
          {
            rowIndex: headerIndex,
            raw: (table[headerIndex] ?? []).join(', '),
            reason: 'Hàng tiêu đề thiếu cột ngày, mô tả, hoặc số tiền.',
          },
        ],
        profileId: profile.id,
      };
    }

    const rows: RawTransaction[] = [];
    const skipped: SkippedRow[] = [];

    for (let i = headerIndex + 1; i < table.length; i += 1) {
      const cells = table[i];
      if (!cells) continue;

      const raw = cells.join(' | ');
      const outcome = parseRow(cells, columns, profile, rows.length);

      if ('reason' in outcome) {
        // Dòng tổng cộng / chữ ký / ghi chú ở cuối file là chuyện thường, và một
        // dòng như thế không được làm hỏng cả lần import. Thu lại để báo ở preview.
        skipped.push({ rowIndex: i - headerIndex - 1, raw, reason: outcome.reason });
        continue;
      }

      rows.push(outcome);
    }

    return { rows, skipped, profileId: profile.id };
  }
}

/**
 * CSV do Excel trên Windows xuất thường có BOM, và đôi khi là UTF-16LE.
 * Đọc thẳng bằng utf8 sẽ ra chuỗi rác và mọi cột đều không khớp.
 */
function decodeCsv(buffer: Buffer): string {
  if (buffer.length >= 2) {
    // UTF-16LE BOM
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.subarray(2).toString('utf16le');
    }
    // UTF-16BE: Node không đọc trực tiếp, đảo byte rồi đọc như LE
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      const swapped = Buffer.from(buffer.subarray(2));
      swapped.swap16();
      return swapped.toString('utf16le');
    }
  }

  const text = buffer.toString('utf8');
  // UTF-8 BOM
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Tìm hàng tiêu đề thật.
 *
 * Không dùng `profile.skipRows` làm chân lý: số dòng tiêu đề của cùng một ngân
 * hàng thay đổi theo kỳ sao kê (có kỳ thêm dòng "Số dư đầu kỳ"). Nên `skipRows`
 * chỉ là điểm bắt đầu tìm, còn hàng nào là header thì nhận diện bằng nội dung —
 * hàng đầu tiên có cả cột ngày và ít nhất một cột tiền.
 */
function findHeaderRow(table: string[][], profile: BankProfile): number | null {
  const start = Math.min(profile.skipRows, Math.max(0, table.length - 1));

  for (let i = start; i < Math.min(table.length, start + 30); i += 1) {
    const headers = (table[i] ?? []).map((cell) => normalizeHeader(String(cell ?? '')));
    if (resolveColumns(headers, profile)) {
      return i;
    }
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

  // Rồi mới khớp một phần, cho header kiểu 'ngaygiaodichdd/mm/yyyy'.
  // Chỉ nhận alias đủ dài để không khớp bừa: 'no'/'co' mà khớp một phần sẽ
  // trúng cả 'noidung'.
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

  if (date === null || desc === null) return null;

  // Cần ít nhất một cách để biết số tiền
  const hasDebitCredit = debit !== null || credit !== null;
  if (!hasDebitCredit && amount === null) return null;

  return { date, desc, amount, debit, credit, balance };
}

function cellAt(cells: string[], index: number | null): string {
  if (index === null) return '';
  return String(cells[index] ?? '').trim();
}

function parseRow(
  cells: string[],
  columns: ResolvedColumns,
  profile: BankProfile,
  rowIndex: number,
): RawTransaction | { reason: string } {
  const dateText = cellAt(cells, columns.date);
  const date = parseStatementDate(dateText, profile.dateFormat);

  if (!date) {
    return {
      reason: dateText
        ? `Không đọc được ngày "${dateText}" theo định dạng ${profile.dateFormat}`
        : 'Thiếu ngày giao dịch',
    };
  }

  const description = cellAt(cells, columns.desc);
  if (description === '') {
    return { reason: 'Thiếu nội dung giao dịch' };
  }

  const amount = resolveAmount(cells, columns);
  if (amount === null) {
    return { reason: 'Không đọc được số tiền, hoặc số tiền bằng 0' };
  }

  return {
    date,
    amount,
    description,
    balance: parseStatementAmount(cellAt(cells, columns.balance)),
    raw: cells.join(' | '),
    rowIndex,
  };
}

/**
 * Suy ra số tiền có dấu.
 *
 * Cặp nợ/có được ưu tiên hơn cột số tiền đơn: khi sao kê có cả hai kiểu thì cặp
 * nợ/có nói rõ chiều, còn cột số tiền đơn có thể không mang dấu (một số ngân
 * hàng xuất số dương ở cả hai chiều và chỉ phân biệt bằng cột khác) — tin vào nó
 * sẽ biến mọi khoản chi thành khoản thu.
 */
function resolveAmount(cells: string[], columns: ResolvedColumns): bigint | null {
  const debit = parseStatementAmount(cellAt(cells, columns.debit));
  const credit = parseStatementAmount(cellAt(cells, columns.credit));

  if (debit !== null || credit !== null) {
    // Nợ = tiền ra = chi = âm. Dùng abs vì có ngân hàng đã để sẵn dấu trừ ở cột nợ.
    if (debit !== null && credit !== null) {
      // Cả hai cột có số là dữ liệu mâu thuẫn — không đoán.
      return null;
    }
    return debit !== null ? -abs(debit) : abs(credit as bigint);
  }

  return parseStatementAmount(cellAt(cells, columns.amount));
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}
