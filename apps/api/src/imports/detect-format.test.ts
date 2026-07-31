import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectFormat, explainUnsupported } from './detect-format';

/** Chữ ký OLE2 / Compound File Binary — đầu mọi file Excel 97-2003. */
const OLE2_HEADER = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function withHeader(header: Buffer, padding = 512): Buffer {
  return Buffer.concat([header, Buffer.alloc(padding)]);
}

describe('detectFormat', () => {
  it('nhận .xlsx thật qua chữ ký ZIP + entry của Office Open XML', () => {
    const buffer = readFileSync(join(__dirname, '__fixtures__', 'sao-ke-mau.xlsx'));
    expect(detectFormat(buffer)).toBe('xlsx');
  });

  it('nhận file .xls dù được đặt tên .xlsx — đây là lỗi gặp thật', () => {
    // Ngân hàng xuất Excel 97-2003 rồi đặt tên .xlsx. Trước khi có hàm này, file
    // như vậy đi thẳng vào XlsxParser và người dùng nhận 500 kèm stack trace,
    // trong khi họ nhìn thấy đuôi .xlsx trên máy mình.
    expect(detectFormat(withHeader(OLE2_HEADER))).toBe('xls-legacy');
  });

  it('nhận PDF', () => {
    expect(detectFormat(Buffer.from('%PDF-1.7\n...', 'latin1'))).toBe('pdf');
  });

  it('phân biệt ZIP-không-phải-xlsx với xlsx', () => {
    // ZIP hợp lệ nhưng không có entry nào của Office Open XML
    const plainZip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('anh-meo.jpg', 'latin1'),
      Buffer.alloc(64),
    ]);
    expect(detectFormat(plainZip)).toBe('zip-other');
  });

  it('nhận CSV là text', () => {
    const csv = 'Ngày,Nội dung,Số tiền\n15/07/2026,GRAB,-120.000\n';
    expect(detectFormat(Buffer.from(csv, 'utf8'))).toBe('text');
  });

  it('CSV có BOM UTF-8 vẫn là text', () => {
    expect(detectFormat(Buffer.from('﻿Ngày,Nội dung\n1,2\n', 'utf8'))).toBe('text');
  });

  it('CSV UTF-16LE vẫn là text, dù có byte NUL rải rác', () => {
    const buffer = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('Ngày,Nội dung\n1,2\n', 'utf16le'),
    ]);
    expect(detectFormat(buffer)).toBe('text');
  });

  it('file rỗng', () => {
    expect(detectFormat(Buffer.alloc(0))).toBe('empty');
  });

  it('binary lạ không bị nhận nhầm là text', () => {
    // Đầy byte điều khiển — không phải text
    const noise = Buffer.from(Array.from({ length: 512 }, (_, i) => i % 8));
    expect(detectFormat(noise)).toBe('unknown-binary');
  });

  it('không nhìn vào tên file — chỉ nội dung quyết định', () => {
    // Cùng một buffer, kết quả không phụ thuộc tên gọi ở bất kỳ đâu
    const csvBuffer = Buffer.from('Ngày,Nội dung,Số tiền\n15/07/2026,GRAB,-1.000\n', 'utf8');
    expect(detectFormat(csvBuffer)).toBe('text');
    expect(detectFormat(withHeader(OLE2_HEADER))).toBe('xls-legacy');
  });
});

describe('explainUnsupported', () => {
  it('với .xls nói rõ file thực sự là gì VÀ cách sửa', () => {
    const message = explainUnsupported('xls-legacy', 'sao-ke.xlsx');
    // Tên file phải có trong thông báo — người dùng có thể đã chọn nhầm file
    expect(message).toContain('sao-ke.xlsx');
    // Nói file thực chất là gì
    expect(message).toContain('.xls');
    // Và nói phải làm gì — "định dạng không hỗ trợ" thì đúng nhưng vô dụng
    expect(message).toMatch(/lưu lại|Save As|\.xlsx/i);
  });

  it('với PDF nói rõ chưa hỗ trợ và gợi ý định dạng thay thế', () => {
    const message = explainUnsupported('pdf', 'sao-ke.pdf');
    expect(message).toContain('PDF');
    expect(message).toMatch(/csv|xlsx/i);
  });

  it('mọi định dạng không đọc được đều có thông báo, không rơi vào mặc định trống', () => {
    for (const format of ['xls-legacy', 'pdf', 'zip-other', 'empty', 'unknown-binary'] as const) {
      const message = explainUnsupported(format, 'test.dat');
      expect(message.length).toBeGreaterThan(20);
    }
  });
});
