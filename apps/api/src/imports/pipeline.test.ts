import { describe, expect, it } from 'vitest';
import { GENERIC_PROFILE } from './bank-profiles';
import { categorize, categorizeAll, type CategorizerRule } from './categorizer';
import { normalize } from './normalizer';
import { CsvParser } from './parsers/csv.parser';
import type { UploadedFile } from './types';

const parser = new CsvParser();

function csv(content: string, name = 'sao-ke.csv'): UploadedFile {
  const buffer = Buffer.from(content, 'utf8');
  return { originalName: name, buffer, mimeType: 'text/csv', size: buffer.length };
}

function parse(content: string, profile = GENERIC_PROFILE) {
  return parser.parse(csv(content), profile);
}

describe('CsvParser — nhận dạng cột', () => {
  it('đọc được sao kê kiểu tách cột nợ/có (phổ biến ở VN)', () => {
    const result = parse(
      [
        'Ngày giao dịch,Nội dung,Số tiền ghi nợ,Số tiền ghi có,Số dư',
        '15/07/2026,HIGHLANDS COFFEE,50.000,,1.950.000',
        '16/07/2026,LUONG THANG 7,,20.000.000,21.950.000',
      ].join('\n'),
    );

    expect(result.skipped).toEqual([]);
    expect(result.rows).toHaveLength(2);
    // Nợ = tiền ra = âm
    expect(result.rows[0]?.amount).toBe(-50_000n);
    // Có = tiền vào = dương
    expect(result.rows[1]?.amount).toBe(20_000_000n);
    expect(result.rows[0]?.balance).toBe(1_950_000n);
    expect(result.rows[0]?.date).toBe('2026-07-15');
  });

  it('đọc được sao kê kiểu một cột số tiền có dấu', () => {
    const result = parse(
      ['Ngày,Mô tả,Số tiền', '15/07/2026,GRAB,-120.000', '20/07/2026,HOAN TIEN,+45.000'].join(
        '\n',
      ),
    );

    expect(result.rows.map((r) => r.amount)).toEqual([-120_000n, 45_000n]);
  });

  it('không phân biệt hoa thường / dấu / dấu câu ở tên cột', () => {
    const result = parse(
      ['NGAY_GIAO_DICH;NOI DUNG;SO TIEN', '15/07/2026;GRAB;-120.000'].join('\n'),
    );
    expect(result.rows).toHaveLength(1);
  });

  it('tự dò delimiter — dấu chấm phẩy khi Excel dùng phẩy thập phân', () => {
    const result = parse(['Ngày;Nội dung;Số tiền', '15/07/2026;GRAB;-120.000'].join('\n'));
    expect(result.rows[0]?.amount).toBe(-120_000n);
  });

  it('bỏ qua các dòng tiêu đề sao kê trước hàng header thật', () => {
    // Số dòng tiêu đề khác nhau giữa các kỳ, nên header được nhận diện bằng
    // nội dung thay vì tin vào skipRows.
    const result = parse(
      [
        'NGAN HANG TMCP ABC',
        'SAO KE TAI KHOAN',
        'So tai khoan: 0123456789',
        'Ky: 01/07/2026 - 31/07/2026',
        '',
        'Ngày giao dịch,Nội dung,Số tiền',
        '15/07/2026,GRAB,-120.000',
      ].join('\n'),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.description).toBe('GRAB');
  });

  it('xử lý BOM của Excel trên Windows', () => {
    const withBom = `﻿Ngày,Nội dung,Số tiền\n15/07/2026,GRAB,-120.000`;
    const buffer = Buffer.from(withBom, 'utf8');
    const result = parser.parse(
      { originalName: 'a.csv', buffer, mimeType: 'text/csv', size: buffer.length },
      GENERIC_PROFILE,
    );
    expect(result.rows).toHaveLength(1);
  });

  it('xử lý file UTF-16LE', () => {
    const content = 'Ngày,Nội dung,Số tiền\n15/07/2026,GRAB,-120.000';
    const buffer = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(content, 'utf16le'),
    ]);
    const result = parser.parse(
      { originalName: 'a.csv', buffer, mimeType: 'text/csv', size: buffer.length },
      GENERIC_PROFILE,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.description).toBe('GRAB');
  });
});

describe('CsvParser — dòng lỗi không được làm hỏng cả lần import', () => {
  it('dòng tổng cộng ở cuối file bị bỏ kèm lý do, các dòng khác vẫn vào', () => {
    const result = parse(
      [
        'Ngày,Nội dung,Số tiền',
        '15/07/2026,GRAB,-120.000',
        '16/07/2026,SHOPEE,-350.000',
        ',TỔNG CỘNG,-470.000',
      ].join('\n'),
    );

    expect(result.rows).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain('Thiếu ngày');
    // Dòng gốc được giữ để người dùng đối chiếu
    expect(result.skipped[0]?.raw).toContain('TỔNG CỘNG');
  });

  it('ngày không đọc được thì bỏ dòng đó, nói rõ định dạng đang dùng', () => {
    const result = parse(
      ['Ngày,Nội dung,Số tiền', '2026-07-15,GRAB,-120.000'].join('\n'),
      // profile mặc định là DD/MM/YYYY nên chuỗi ISO không khớp
    );

    expect(result.rows).toHaveLength(0);
    expect(result.skipped[0]?.reason).toContain('DD/MM/YYYY');
  });

  it('cả cột nợ và cột có đều có số → không đoán, bỏ dòng', () => {
    const result = parse(
      ['Ngày,Nội dung,Ghi nợ,Ghi có', '15/07/2026,LOI DU LIEU,50.000,50.000'].join('\n'),
    );
    expect(result.rows).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it('file không có hàng header nhận được ra thì báo rõ, không nổ', () => {
    const result = parse(['a,b,c', '1,2,3'].join('\n'));
    expect(result.rows).toEqual([]);
    expect(result.skipped[0]?.reason).toContain('Không tìm thấy hàng tiêu đề');
  });

  it('file rỗng không làm nổ parser', () => {
    expect(parse('').rows).toEqual([]);
  });

  it('rowIndex đánh theo các dòng ĐỌC ĐƯỢC, liên tục từ 0', () => {
    const result = parse(
      [
        'Ngày,Nội dung,Số tiền',
        ',DONG LOI,-1.000',
        '15/07/2026,GRAB,-120.000',
        '16/07/2026,SHOPEE,-350.000',
      ].join('\n'),
    );
    expect(result.rows.map((r) => r.rowIndex)).toEqual([0, 1]);
  });
});

describe('normalize', () => {
  it('bỏ dấu của amount và chuyển chiều sang `type`', () => {
    const parsed = parse(
      [
        'Ngày,Nội dung,Số tiền',
        '15/07/2026,GRAB,-120.000',
        '16/07/2026,LUONG,20.000.000',
      ].join('\n'),
    );

    const { rows } = normalize(parsed.rows, GENERIC_PROFILE);

    expect(rows[0]?.amount).toBe(120_000n);
    expect(rows[0]?.type).toBe('expense');
    expect(rows[1]?.amount).toBe(20_000_000n);
    expect(rows[1]?.type).toBe('income');
  });

  it('mọi amount trả ra đều dương — bất biến mà CHECK constraint dựa vào', () => {
    const parsed = parse(
      ['Ngày,Nội dung,Số tiền', '15/07/2026,A,-1', '16/07/2026,B,1'].join('\n'),
    );
    const { rows } = normalize(parsed.rows, GENERIC_PROFILE);
    expect(rows.every((r) => r.amount > 0n)).toBe(true);
  });

  it('số tiền vượt trần bị bỏ, nghi là đọc sai cột', () => {
    const parsed = parse(
      ['Ngày,Nội dung,Số tiền', '15/07/2026,A,9.999.999.999.999.999'].join('\n'),
    );
    const { rows, skipped } = normalize(parsed.rows, GENERIC_PROFILE);
    expect(rows).toHaveLength(0);
    expect(skipped[0]?.reason).toContain('đọc sai cột');
  });

  it('gắn sẵn normalizedDescription cho dedupe và categorize dùng', () => {
    const parsed = parse(['Ngày,Nội dung,Số tiền', '15/07/2026,Cà phê Highlands,-50.000'].join('\n'));
    const { rows } = normalize(parsed.rows, GENERIC_PROFILE);
    expect(rows[0]?.normalizedDescription).toBe('CA PHE HIGHLANDS');
    // Mô tả gốc được giữ nguyên để hiển thị
    expect(rows[0]?.description).toBe('Cà phê Highlands');
  });

  it('stripPattern của profile được áp vào normalizedDescription', () => {
    const profile = { ...GENERIC_PROFILE, stripPattern: /REF\d+/g };
    const parsed = parse(
      ['Ngày,Nội dung,Số tiền', '15/07/2026,THANH TOAN REF998877 SHOPEE,-50.000'].join('\n'),
      profile,
    );
    const { rows } = normalize(parsed.rows, profile);
    expect(rows[0]?.normalizedDescription).toBe('THANH TOAN SHOPEE');
  });
});

describe('categorize', () => {
  const rules: CategorizerRule[] = [
    { keyword: 'GRAB', categoryId: 'di-chuyen', categoryType: 'expense', priority: 0 },
    { keyword: 'COFFEE', categoryId: 'an-uong', categoryType: 'expense', priority: 0 },
    { keyword: 'THE COFFEE HOUSE', categoryId: 'ca-phe', categoryType: 'expense', priority: 0 },
    { keyword: 'LUONG', categoryId: 'luong', categoryType: 'income', priority: 0 },
  ];

  it('khớp keyword đơn giản', () => {
    expect(categorize({ normalizedDescription: 'GRAB RIDE', type: 'expense' }, rules)).toBe(
      'di-chuyen',
    );
  });

  it('không khớp thì trả null để người dùng tự gán ở preview', () => {
    expect(categorize({ normalizedDescription: 'QUAN OC CO BA', type: 'expense' }, rules)).toBeNull();
  });

  it('keyword DÀI hơn thắng — nếu không thì kết quả phụ thuộc thứ tự đọc từ DB', () => {
    expect(
      categorize({ normalizedDescription: 'THE COFFEE HOUSE THAO DIEN', type: 'expense' }, rules),
    ).toBe('ca-phe');
    // Đảo thứ tự mảng cũng phải ra cùng kết quả
    expect(
      categorize(
        { normalizedDescription: 'THE COFFEE HOUSE THAO DIEN', type: 'expense' },
        [...rules].reverse(),
      ),
    ).toBe('ca-phe');
  });

  it('priority đè lên độ dài — rule người dùng thắng rule mặc định', () => {
    const withOverride: CategorizerRule[] = [
      ...rules,
      { keyword: 'COFFEE', categoryId: 'giai-tri', categoryType: 'expense', priority: 10 },
    ];
    expect(
      categorize({ normalizedDescription: 'THE COFFEE HOUSE', type: 'expense' }, withOverride),
    ).toBe('giai-tri');
  });

  it('rule chỉ áp cho giao dịch cùng chiều thu/chi', () => {
    // "LUONG" thuộc danh mục thu, nên không được gán cho một khoản chi
    expect(
      categorize({ normalizedDescription: 'TRA LUONG NHAN VIEN', type: 'expense' }, rules),
    ).toBeNull();
    expect(categorize({ normalizedDescription: 'LUONG THANG 7', type: 'income' }, rules)).toBe(
      'luong',
    );
  });

  it('categorizeAll giữ nguyên field cũ và thêm categoryId', () => {
    const rows = [
      { normalizedDescription: 'GRAB RIDE', type: 'expense' as const, rowIndex: 0 },
      { normalizedDescription: 'KHONG BIET', type: 'expense' as const, rowIndex: 1 },
    ];
    const result = categorizeAll(rows, rules);
    expect(result[0]).toMatchObject({ rowIndex: 0, categoryId: 'di-chuyen' });
    expect(result[1]).toMatchObject({ rowIndex: 1, categoryId: null });
  });
});
