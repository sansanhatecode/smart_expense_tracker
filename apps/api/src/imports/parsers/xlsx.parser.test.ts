import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERIC_PROFILE } from '../bank-profiles';
import { normalize } from '../normalizer';
import { coerceAmount, coerceDate } from '../table-parser';
import type { UploadedFile } from '../types';
import { XlsxParser } from './xlsx.parser';

const parser = new XlsxParser();

/**
 * Fixture là file .xlsx thật, dựng giống sao kê tải từ internet banking: có mấy
 * dòng tiêu đề, cột tách nợ/có, header tiếng Việt có dấu, và một dòng tổng cộng
 * ở cuối.
 */
function fixture(): UploadedFile {
  const path = join(__dirname, '..', '__fixtures__', 'sao-ke-mau.xlsx');
  const buffer = readFileSync(path);
  return {
    originalName: 'sao-ke-mau.xlsx',
    buffer,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
  };
}

describe('XlsxParser', () => {
  it('đọc được sao kê .xlsx thật, bỏ đúng phần tiêu đề và dòng tổng', async () => {
    const result = await parser.parse(fixture(), GENERIC_PROFILE);

    // 5 giao dịch thật; dòng "TỔNG CỘNG" thiếu ngày nên bị bỏ
    expect(result.rows).toHaveLength(5);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.raw).toContain('TỔNG CỘNG');
  });

  it('đọc đúng chiều thu/chi từ cặp cột nợ/có', async () => {
    const result = await parser.parse(fixture(), GENERIC_PROFILE);

    const coffee = result.rows[0];
    expect(coffee?.description).toBe('HIGHLANDS COFFEE THAO DIEN');
    expect(coffee?.amount).toBe(-50_000n); // ghi nợ → âm
    expect(coffee?.date).toBe('2026-07-15');

    const salary = result.rows.find((r) => r.description.includes('LUONG'));
    expect(salary?.amount).toBe(20_000_000n); // ghi có → dương
  });

  it('đọc được cột số dư', async () => {
    const result = await parser.parse(fixture(), GENERIC_PROFILE);
    expect(result.rows[0]?.balance).toBe(1_950_000n);
  });

  it('hai giao dịch giống hệt nhau trong file đều được giữ', async () => {
    const result = await parser.parse(fixture(), GENERIC_PROFILE);
    const coffees = result.rows.filter((r) => r.description.includes('HIGHLANDS'));
    expect(coffees).toHaveLength(2);
  });

  it('nối được với normalize để ra dạng vào DB', async () => {
    const result = await parser.parse(fixture(), GENERIC_PROFILE);
    const { rows } = normalize(result.rows, GENERIC_PROFILE);

    expect(rows.every((r) => r.amount > 0n)).toBe(true);
    expect(rows.filter((r) => r.type === 'income')).toHaveLength(1);
    expect(rows.filter((r) => r.type === 'expense')).toHaveLength(4);
  });

  it('file không phải xlsx thì báo lỗi chứ không trả dữ liệu rác', async () => {
    const buffer = Buffer.from('day khong phai file excel', 'utf8');
    await expect(
      parser.parse({ originalName: 'a.xlsx', buffer, mimeType: '', size: buffer.length }, GENERIC_PROFILE),
    ).rejects.toThrow();
  });
});

describe('coerceDate — ba dạng ô ngày mà XLSX có thể cho', () => {
  it('ô Date của Excel (đã định dạng ngày)', () => {
    const date = new Date(Date.UTC(2026, 6, 15));
    expect(coerceDate(date, 'DD/MM/YYYY')).toBe('2026-07-15');
  });

  it('dùng getUTC*, không lệch ngày trên máy múi giờ âm', () => {
    // Nếu dùng getFullYear/getMonth/getDate thì máy ở UTC-7 sẽ ra 2026-07-31
    expect(coerceDate(new Date(Date.UTC(2026, 7, 1)), 'DD/MM/YYYY')).toBe('2026-08-01');
    expect(coerceDate(new Date(Date.UTC(2026, 0, 1)), 'DD/MM/YYYY')).toBe('2026-01-01');
  });

  it('Excel serial number (ô ngày chưa được định dạng)', () => {
    // 45000 ngày kể từ mốc 1899-12-30
    const expected = new Date(Date.UTC(1899, 11, 30) + 45_000 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(coerceDate(45_000, 'DD/MM/YYYY')).toBe(expected);
  });

  it('số dạng YYYYMMDD', () => {
    expect(coerceDate(20_260_715, 'DD/MM/YYYY')).toBe('2026-07-15');
    expect(coerceDate(20_260_230, 'DD/MM/YYYY')).toBeNull(); // 30/02 không tồn tại
  });

  it('chuỗi thì đi qua parseStatementDate như CSV', () => {
    expect(coerceDate('15/07/2026', 'DD/MM/YYYY')).toBe('2026-07-15');
  });

  it('ô rỗng / boolean / Date không hợp lệ trả null', () => {
    expect(coerceDate(null, 'DD/MM/YYYY')).toBeNull();
    expect(coerceDate(undefined, 'DD/MM/YYYY')).toBeNull();
    expect(coerceDate(true, 'DD/MM/YYYY')).toBeNull();
    expect(coerceDate(new Date('khong-phai-ngay'), 'DD/MM/YYYY')).toBeNull();
  });
});

describe('coerceAmount — ô số của XLSX là number, không phải string', () => {
  it('number đi trực tiếp', () => {
    expect(coerceAmount(50_000)).toBe(50_000n);
    expect(coerceAmount(-120_000)).toBe(-120_000n);
  });

  it('làm tròn phần thập phân do Excel sinh ra', () => {
    expect(coerceAmount(50_000.0000001)).toBe(50_000n);
    expect(coerceAmount(50_000.6)).toBe(50_001n);
  });

  it('0 trả null — cột nợ/có luôn có một bên trống', () => {
    expect(coerceAmount(0)).toBeNull();
    expect(coerceAmount(null)).toBeNull();
  });

  it('chuỗi vẫn đi qua parseStatementAmount', () => {
    expect(coerceAmount('1.234.567')).toBe(1_234_567n);
  });

  it('Date và boolean không phải số tiền', () => {
    expect(coerceAmount(new Date())).toBeNull();
    expect(coerceAmount(true)).toBeNull();
  });
});
