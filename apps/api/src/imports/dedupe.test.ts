import { describe, expect, it } from 'vitest';
import {
  assignSequences,
  computeDedupeHash,
  dedupeGroupKey,
  normalizeDescription,
} from './dedupe';

const USER = 'user-1';

/** Rút gọn: mô tả một dòng sao kê đã normalize. */
function row(date: string, amount: number, description: string, type: 'income' | 'expense' = 'expense') {
  return {
    date,
    amount: BigInt(amount),
    type,
    normalizedDescription: normalizeDescription(description),
  };
}

function hashesOf(rows: ReturnType<typeof row>[], offsets?: Map<string, number>): string[] {
  return assignSequences(rows, offsets).map((r) => computeDedupeHash({ userId: USER, ...r }));
}

describe('normalizeDescription', () => {
  it('bỏ dấu tiếng Việt — cùng giao dịch có thể export có dấu hoặc không', () => {
    expect(normalizeDescription('Cà phê Highlands')).toBe('CA PHE HIGHLANDS');
    expect(normalizeDescription('CA PHE HIGHLANDS')).toBe('CA PHE HIGHLANDS');
  });

  it('xử lý đ/Đ, thứ mà NFD không tách được', () => {
    expect(normalizeDescription('Tiền điện tháng 7')).toBe('TIEN DIEN THANG 7');
    expect(normalizeDescription('Đóng học phí')).toBe('DONG HOC PHI');
  });

  it('gộp khoảng trắng và bỏ dấu câu', () => {
    expect(normalizeDescription('  GRAB*RIDE   -  12/07  ')).toBe('GRAB RIDE 12 07');
  });

  it('GIỮ chữ số: bỏ đi thì hai giao dịch khác nhau có thể trùng khoá', () => {
    expect(normalizeDescription('CK DEN 0123456789')).toContain('0123456789');
  });

  it('stripPattern là chỗ xử lý mã tham chiếu biến động của từng ngân hàng', () => {
    const stripRef = /REF\d+/g;
    expect(normalizeDescription('THANH TOAN REF998877 SHOPEE', stripRef)).toBe(
      'THANH TOAN SHOPEE',
    );
    // Cùng giao dịch, mã ref khác → sau khi strip phải ra cùng kết quả
    expect(normalizeDescription('THANH TOAN REF112233 SHOPEE', stripRef)).toBe(
      'THANH TOAN SHOPEE',
    );
  });

  it('mô tả rỗng sau chuẩn hoá vẫn là chuỗi rỗng, không phải undefined', () => {
    expect(normalizeDescription('---')).toBe('');
  });
});

describe('assignSequences', () => {
  it('hai dòng giống hệt nhau được seq 0 và 1', () => {
    const rows = [row('2026-07-15', 25000, 'HIGHLANDS'), row('2026-07-15', 25000, 'HIGHLANDS')];
    expect(assignSequences(rows).map((r) => r.seq)).toEqual([0, 1]);
  });

  it('dòng khác nhau đều được seq 0 — mỗi nhóm đếm riêng', () => {
    const rows = [
      row('2026-07-15', 25000, 'HIGHLANDS'),
      row('2026-07-15', 45000, 'HIGHLANDS'),
      row('2026-07-16', 25000, 'HIGHLANDS'),
      row('2026-07-15', 25000, 'PHUC LONG'),
      row('2026-07-15', 25000, 'HIGHLANDS', 'income'),
    ];
    expect(assignSequences(rows).map((r) => r.seq)).toEqual([0, 0, 0, 0, 0]);
  });

  it('có tính ổn định: cùng input cho cùng seq', () => {
    const rows = [row('2026-07-15', 25000, 'A'), row('2026-07-15', 25000, 'A')];
    expect(assignSequences(rows).map((r) => r.seq)).toEqual(
      assignSequences(rows).map((r) => r.seq),
    );
  });

  it('offset dịch seq lên — dùng cho giao dịch nhập tay', () => {
    const r = row('2026-07-15', 25000, 'HIGHLANDS');
    const offsets = new Map([[dedupeGroupKey(r), 2]]);
    expect(assignSequences([r, r], offsets).map((x) => x.seq)).toEqual([2, 3]);
  });
});

describe('dedupe hash — các tình huống thật', () => {
  it('import LẠI cùng file → hash giống hệt → nhận ra trùng', () => {
    const file = [
      row('2026-07-15', 25000, 'HIGHLANDS COFFEE'),
      row('2026-07-15', 25000, 'HIGHLANDS COFFEE'),
      row('2026-07-16', 120000, 'GRAB'),
    ];
    expect(hashesOf(file)).toEqual(hashesOf(file));
  });

  it('HAI ly cà phê thật cùng ngày → hash KHÁC nhau → giữ cả hai', () => {
    const [first, second] = hashesOf([
      row('2026-07-15', 25000, 'HIGHLANDS COFFEE'),
      row('2026-07-15', 25000, 'HIGHLANDS COFFEE'),
    ]);
    // Đây là hồi quy cho bug mất dữ liệu: hash chỉ gồm (date, amount, desc) sẽ
    // làm hai hash này bằng nhau và unique constraint xoá mất ly thứ hai.
    expect(first).not.toBe(second);
  });

  it('file chồng kỳ dài hơn: phần trùng vẫn ra đúng hash cũ', () => {
    const firstImport = [row('2026-07-15', 25000, 'A'), row('2026-07-15', 25000, 'A')];
    const secondImport = [
      row('2026-07-15', 25000, 'A'),
      row('2026-07-15', 25000, 'A'),
      row('2026-07-20', 99000, 'B'), // dòng mới
    ];

    const before = hashesOf(firstImport);
    const after = hashesOf(secondImport);

    expect(after.slice(0, 2)).toEqual(before);
    expect(after[2]).not.toBeUndefined();
    expect(before).not.toContain(after[2]);
  });

  it('nhập tay rồi import sao kê chứa đúng giao dịch đó → nhận ra trùng', () => {
    // Đây là lý do bỏ `balance` khỏi hash. Nếu hash gồm balance thì dòng nhập
    // tay (không có balance) và dòng sao kê (có balance) nằm ở hai không gian
    // hash rời nhau, và người dùng nhận về hai bản của cùng một giao dịch.
    const manual = row('2026-07-15', 25000, 'HIGHLANDS COFFEE');
    const manualHash = hashesOf([manual])[0];

    // Sau đó import file có 2 ly cà phê cùng ngày
    const imported = hashesOf([manual, manual]);

    expect(imported[0]).toBe(manualHash); // trùng với bản nhập tay
    expect(imported[1]).not.toBe(manualHash); // ly thứ hai là mới
  });

  it('hash phụ thuộc userId — hai user không đụng dedupe của nhau', () => {
    const r = { ...row('2026-07-15', 25000, 'A'), seq: 0 };
    expect(computeDedupeHash({ userId: 'user-1', ...r })).not.toBe(
      computeDedupeHash({ userId: 'user-2', ...r }),
    );
  });

  it('hash phụ thuộc type — cùng số tiền nhưng thu/chi khác nhau là hai giao dịch', () => {
    const base = { date: '2026-07-15', amount: 25000n, normalizedDescription: 'A', seq: 0 };
    expect(computeDedupeHash({ userId: USER, ...base, type: 'expense' })).not.toBe(
      computeDedupeHash({ userId: USER, ...base, type: 'income' }),
    );
  });

  it('mô tả chỉ khác dấu → cùng hash (nhờ normalize) → không sinh trùng', () => {
    const withTones = row('2026-07-15', 25000, 'Cà phê');
    const without = row('2026-07-15', 25000, 'CA PHE');
    expect(hashesOf([withTones])).toEqual(hashesOf([without]));
  });

  it('là sha256 (64 hex), không phải sha1', () => {
    expect(hashesOf([row('2026-07-15', 1000, 'A')])[0]).toMatch(/^[0-9a-f]{64}$/);
  });
});
