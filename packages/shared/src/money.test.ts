import { describe, expect, it } from 'vitest';
import {
  MAX_SAFE_VND,
  bigintToNumber,
  budgetRatio,
  formatVnd,
  formatVndCompact,
  numberToBigint,
  parseVndInput,
  signedAmount,
} from './money';

describe('formatVndCompact', () => {
  it.each([
    [0, '0đ'],
    [850, '850đ'],
    [999, '999đ'],
    [1_000, '1 ng'],
    [45_000, '45 ng'],
    [300_000, '300 ng'],
    [1_000_000, '1 tr'],
    [1_250_000, '1,3 tr'],
    [3_400_000_000, '3,4 tỷ'],
  ])('%i → %s', (input, expected) => {
    expect(formatVndCompact(input)).toBe(expected);
  });

  it('giữ 1 chữ số thập phân tới 100 đơn vị, vì làm tròn ở mức triệu mất 500 nghìn', () => {
    expect(formatVndCompact(12_500_000)).toBe('12,5 tr');
    expect(formatVndCompact(99_900_000)).toBe('99,9 tr');
  });

  it('bỏ thập phân từ 100 đơn vị trở lên, lúc đó sai số đã không đáng kể', () => {
    expect(formatVndCompact(340_000_000)).toBe('340 tr');
  });

  it('giữ dấu âm', () => {
    expect(formatVndCompact(-2_500_000)).toBe('-2,5 tr');
    expect(formatVndCompact(-500)).toBe('-500đ');
  });
});

describe('parseVndInput', () => {
  it('coi mọi dấu chấm/phẩy/khoảng trắng là phân tách nghìn khi không có hậu tố', () => {
    expect(parseVndInput('1.234.567')).toBe(1_234_567);
    expect(parseVndInput('1,234,567')).toBe(1_234_567);
    expect(parseVndInput('1 234 567')).toBe(1_234_567);
    expect(parseVndInput('1234567')).toBe(1_234_567);
  });

  it('hiểu hậu tố viết tắt', () => {
    expect(parseVndInput('45k')).toBe(45_000);
    expect(parseVndInput('300 ng')).toBe(300_000);
    expect(parseVndInput('1,5tr')).toBe(1_500_000);
    expect(parseVndInput('12,5 triệu')).toBe(12_500_000);
    expect(parseVndInput('2 tỷ')).toBe(2_000_000_000);
  });

  it('ở dạng hậu tố thì dấu chấm là thập phân, không phải phân tách nghìn', () => {
    // "1.5tr" không thể là "một nghìn năm trăm triệu" — không ai gõ thế
    expect(parseVndInput('1.5tr')).toBe(1_500_000);
  });

  it('bỏ qua ký hiệu tiền tệ', () => {
    expect(parseVndInput('₫50000')).toBe(50_000);
    expect(parseVndInput('50000 VND')).toBe(50_000);
    expect(parseVndInput('50000 đồng')).toBe(50_000);
  });

  it('trả null khi không parse được, không đoán bừa', () => {
    expect(parseVndInput('abc')).toBeNull();
    expect(parseVndInput('')).toBeNull();
    expect(parseVndInput('   ')).toBeNull();
    expect(parseVndInput('12tr34')).toBeNull();
    expect(parseVndInput('-5000')).toBeNull();
  });

  it('trả null thay vì số mất chính xác khi vượt ngưỡng an toàn', () => {
    expect(parseVndInput('99999999 tỷ')).toBeNull();
  });
});

describe('bigintToNumber', () => {
  it('chuyển được số tiền trong biên', () => {
    expect(bigintToNumber(1_234_567n)).toBe(1_234_567);
    expect(bigintToNumber(0n)).toBe(0);
  });

  it('ném lỗi thay vì mất chính xác âm thầm', () => {
    const tooBig = BigInt(MAX_SAFE_VND) + 1n;
    expect(() => bigintToNumber(tooBig)).toThrow(RangeError);
  });
});

describe('numberToBigint', () => {
  it('từ chối số không nguyên — VND không có đơn vị nhỏ hơn đồng', () => {
    expect(() => numberToBigint(1500.5)).toThrow(TypeError);
  });

  it('round-trip không đổi giá trị', () => {
    for (const n of [0, 1, 50_000, 1_000_000_000_000_000]) {
      expect(bigintToNumber(numberToBigint(n))).toBe(n);
    }
  });
});

describe('signedAmount', () => {
  it('chỉ dùng cho hiển thị: chi thành âm, thu giữ dương', () => {
    expect(signedAmount(50_000, 'expense')).toBe(-50_000);
    expect(signedAmount(50_000, 'income')).toBe(50_000);
  });
});

describe('budgetRatio', () => {
  it('không kẹp trên, vì cần biết đã vượt bao nhiêu', () => {
    expect(budgetRatio(1_500, 1_000)).toBe(1.5);
  });

  it('limit 0 hoặc âm trả 0 thay vì Infinity/NaN', () => {
    expect(budgetRatio(1_000, 0)).toBe(0);
    expect(budgetRatio(1_000, -5)).toBe(0);
  });
});

describe('formatVnd', () => {
  it('không có phần thập phân', () => {
    expect(formatVnd(1_234_567)).not.toMatch(/[.,]\d{2}\s*₫/);
  });
});
