import type { ImportSource } from '@expense/shared';
import readXlsxFile from 'read-excel-file/node';
import { parseTable, type Cell } from '../table-parser';
import type { BankProfile, ParseResult, StatementParser, UploadedFile } from '../types';

/**
 * Đọc .xlsx bằng `read-excel-file`, KHÔNG dùng exceljs hay xlsx. Xem ADR 9.2.
 *
 * Số liệu dẫn tới lựa chọn này: exceljs kéo theo 76 package transitive và mọi
 * lỗ hổng mà `npm audit` báo (archiver, glob, minimatch, rimraf, uuid) đều nằm
 * trong số đó, không có bản fix tiến lên. `read-excel-file` kéo 6 package và
 * không bị báo lỗ hổng nào. Ta chỉ cần ĐỌC .xlsx, nên một thư viện đọc-ghi-
 * styling đầy đủ là quyền hạn thừa — và cái thừa đó chính là chỗ phát sinh rủi ro.
 */
export class XlsxParser implements StatementParser {
  readonly source: ImportSource = 'xlsx';


  async parse(file: UploadedFile, profile: BankProfile): Promise<ParseResult> {
    const table = await readFirstSheet(file.buffer);
    return parseTable(table, profile);
  }
}

/**
 * `read-excel-file` (9.x) khi nhận Buffer trả về `[{ sheet, data }]` cho mọi
 * sheet, không phải mảng hàng — kể cả khi truyền option `sheet`. Hàm này che sự
 * khác biệt đó, và chịu được cả trường hợp bản sau đổi sang trả thẳng mảng hàng.
 */
async function readFirstSheet(buffer: Buffer): Promise<Cell[][]> {
  const result = (await readXlsxFile(buffer)) as unknown;

  if (!Array.isArray(result) || result.length === 0) return [];

  const first = result[0] as unknown;

  if (isSheetEnvelope(first)) {
    // Chỉ đọc sheet đầu: sao kê ngân hàng luôn nằm ở sheet đầu, còn các sheet sau
    // (nếu có) là ghi chú hoặc bảng phụ — gộp chúng vào sẽ sinh giao dịch rác.
    return first.data as Cell[][];
  }

  return result as Cell[][];
}

function isSheetEnvelope(value: unknown): value is { sheet: string; data: unknown[][] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    Array.isArray((value as { data: unknown }).data)
  );
}
