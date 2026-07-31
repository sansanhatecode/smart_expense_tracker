import type { ImportSource } from '@expense/shared';
import Papa from 'papaparse';
import { parseTable, type Cell } from '../table-parser';
import type { BankProfile, ParseResult, StatementParser, UploadedFile } from '../types';

export class CsvParser implements StatementParser {
  readonly source: ImportSource = 'csv';

  supports(file: UploadedFile): boolean {
    if (/\.csv$/i.test(file.originalName)) return true;
    // Nhiều nơi trả text/plain cho .csv nên không tin mimeType một mình.
    return file.mimeType === 'text/csv' || file.mimeType === 'application/csv';
  }

  parse(file: UploadedFile, profile: BankProfile): Promise<ParseResult> {
    const text = decodeCsv(file.buffer);

    // Để papaparse tự dò delimiter: sao kê VN xuất bằng ',' và cả ';' (Excel ở
    // vùng dùng phẩy thập phân sẽ chọn ';'), đôi khi cả tab.
    const parsed = Papa.parse<string[]>(text, {
      skipEmptyLines: 'greedy',
      delimitersToGuess: [',', ';', '\t', '|'],
    });

    const table: Cell[][] = parsed.data.filter(
      (row): row is string[] => Array.isArray(row) && row.length > 1,
    );

    return Promise.resolve(parseTable(table, profile));
  }
}

/**
 * CSV do Excel trên Windows xuất thường có BOM, và đôi khi là UTF-16.
 * Đọc thẳng bằng utf8 sẽ ra chuỗi rác và mọi cột đều lặng lẽ không khớp.
 */
function decodeCsv(buffer: Buffer): string {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.subarray(2).toString('utf16le');
    }
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      // UTF-16BE: Node không đọc trực tiếp, đảo byte rồi đọc như LE
      const swapped = Buffer.from(buffer.subarray(2));
      swapped.swap16();
      return swapped.toString('utf16le');
    }
  }

  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
