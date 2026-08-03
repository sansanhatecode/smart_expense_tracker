import { describe, expect, it } from 'vitest';
import {
  isCardBillPayment,
  isFailedStatus,
  isSelfTransfer,
  isWalletTopup,
  normalizeHeader,
  parseStatementAmount,
  parseStatementDate,
} from './parse-value';

describe('parseStatementAmount', () => {
  it('dấu chấm phân tách nghìn — dạng phổ biến nhất ở VN', () => {
    expect(parseStatementAmount('1.234.567')).toBe(1_234_567n);
    expect(parseStatementAmount('50.000')).toBe(50_000n);
  });

  it('dấu phẩy phân tách nghìn — bản tiếng Anh', () => {
    expect(parseStatementAmount('1,234,567')).toBe(1_234_567n);
  });

  it('khoảng trắng phân tách nghìn', () => {
    expect(parseStatementAmount('1 234 567')).toBe(1_234_567n);
  });

  it('không có dấu phân cách', () => {
    expect(parseStatementAmount('1234567')).toBe(1_234_567n);
  });

  it('kiểu Mỹ có phần thập phân', () => {
    expect(parseStatementAmount('1,234,567.00')).toBe(1_234_567n);
    expect(parseStatementAmount('1,234,567.49')).toBe(1_234_567n);
    expect(parseStatementAmount('1,234,567.50')).toBe(1_234_568n);
  });

  it('kiểu VN/Âu có phần thập phân', () => {
    expect(parseStatementAmount('1.234.567,00')).toBe(1_234_567n);
    expect(parseStatementAmount('1.234.567,99')).toBe(1_234_568n);
  });

  it('phân biệt được thập phân với phân tách nghìn khi chỉ có một dấu', () => {
    // 3 chữ số sau dấu → phân tách nghìn
    expect(parseStatementAmount('1.234')).toBe(1_234n);
    expect(parseStatementAmount('1,234')).toBe(1_234n);
    // 2 chữ số sau dấu → thập phân
    expect(parseStatementAmount('1234.56')).toBe(1_235n);
    expect(parseStatementAmount('1234,56')).toBe(1_235n);
  });

  it('ngoặc kiểu kế toán là số âm', () => {
    expect(parseStatementAmount('(1.234.567)')).toBe(-1_234_567n);
    expect(parseStatementAmount('(50.000)')).toBe(-50_000n);
  });

  it('dấu trừ và dấu cộng', () => {
    expect(parseStatementAmount('-1.234.567')).toBe(-1_234_567n);
    expect(parseStatementAmount('+1.234.567')).toBe(1_234_567n);
  });

  it('bỏ qua đơn vị tiền tệ', () => {
    expect(parseStatementAmount('1.234.567 VND')).toBe(1_234_567n);
    expect(parseStatementAmount('1.234.567đ')).toBe(1_234_567n);
    expect(parseStatementAmount('1.234.567 ₫')).toBe(1_234_567n);
  });

  it('ô trống hoặc 0 trả null — cột nợ/có luôn có một bên rỗng', () => {
    expect(parseStatementAmount('')).toBeNull();
    expect(parseStatementAmount('   ')).toBeNull();
    expect(parseStatementAmount('-')).toBeNull();
    expect(parseStatementAmount('0')).toBeNull();
    expect(parseStatementAmount('0.00')).toBeNull();
    expect(parseStatementAmount(null)).toBeNull();
    expect(parseStatementAmount(undefined)).toBeNull();
  });

  it('trả null thay vì đoán khi ô không phải số', () => {
    expect(parseStatementAmount('N/A')).toBeNull();
    expect(parseStatementAmount('Tổng cộng')).toBeNull();
    expect(parseStatementAmount('1.234abc')).toBeNull();
  });

  it('số rất lớn không mất chính xác (đây là lý do dùng BigInt)', () => {
    // Số này vượt Number.MAX_SAFE_INTEGER
    expect(parseStatementAmount('9.007.199.254.740.993')).toBe(9_007_199_254_740_993n);
  });
});

describe('parseStatementDate', () => {
  it('DD/MM/YYYY — định dạng của hầu hết sao kê VN', () => {
    expect(parseStatementDate('15/07/2026', 'DD/MM/YYYY')).toBe('2026-07-15');
    expect(parseStatementDate('01/01/2026', 'DD/MM/YYYY')).toBe('2026-01-01');
  });

  it('không pad số 0 vẫn đọc được', () => {
    expect(parseStatementDate('1/7/2026', 'DD/MM/YYYY')).toBe('2026-07-01');
  });

  it('YYYY-MM-DD', () => {
    expect(parseStatementDate('2026-07-15', 'YYYY-MM-DD')).toBe('2026-07-15');
  });

  it('DD-MM-YYYY', () => {
    expect(parseStatementDate('15-07-2026', 'DD-MM-YYYY')).toBe('2026-07-15');
  });

  it('MM/DD/YYYY — phân biệt được với DD/MM/YYYY nhờ format', () => {
    expect(parseStatementDate('07/15/2026', 'MM/DD/YYYY')).toBe('2026-07-15');
    // Cùng chuỗi, format khác → kết quả khác. Đây là lý do format phải khai báo.
    expect(parseStatementDate('01/02/2026', 'DD/MM/YYYY')).toBe('2026-02-01');
    expect(parseStatementDate('01/02/2026', 'MM/DD/YYYY')).toBe('2026-01-02');
  });

  it('năm 2 chữ số dùng mốc 70', () => {
    expect(parseStatementDate('15/07/26', 'DD/MM/YY')).toBe('2026-07-15');
    expect(parseStatementDate('15/07/99', 'DD/MM/YY')).toBe('1999-07-15');
  });

  it('bỏ phần giờ nếu ô có kèm', () => {
    expect(parseStatementDate('15/07/2026 14:30:00', 'DD/MM/YYYY')).toBe('2026-07-15');
  });

  it('chấp nhận dấu phân cách khác với format', () => {
    // Sao kê hay lẫn lộn / và -, mà ý nghĩa thứ tự vẫn thế
    expect(parseStatementDate('15-07-2026', 'DD/MM/YYYY')).toBe('2026-07-15');
    expect(parseStatementDate('15.07.2026', 'DD/MM/YYYY')).toBe('2026-07-15');
  });

  it('ngày không tồn tại trả null, không tự cuộn sang tháng sau', () => {
    // new Date(2026, 1, 30) sẽ ra 02/03 — đúng thứ phải tránh
    expect(parseStatementDate('30/02/2026', 'DD/MM/YYYY')).toBeNull();
    expect(parseStatementDate('31/04/2026', 'DD/MM/YYYY')).toBeNull();
    expect(parseStatementDate('00/07/2026', 'DD/MM/YYYY')).toBeNull();
    expect(parseStatementDate('15/13/2026', 'DD/MM/YYYY')).toBeNull();
  });

  it('29/02 hợp lệ ở năm nhuận, không hợp lệ ở năm thường', () => {
    expect(parseStatementDate('29/02/2024', 'DD/MM/YYYY')).toBe('2024-02-29');
    expect(parseStatementDate('29/02/2026', 'DD/MM/YYYY')).toBeNull();
  });

  it('không phải ngày trả null', () => {
    expect(parseStatementDate('', 'DD/MM/YYYY')).toBeNull();
    expect(parseStatementDate('Tổng cộng', 'DD/MM/YYYY')).toBeNull();
    expect(parseStatementDate(null, 'DD/MM/YYYY')).toBeNull();
  });

  it('không phụ thuộc múi giờ máy chạy (không đi qua Date cho kết quả)', () => {
    // Ngày đầu và cuối tháng là chỗ lệch múi giờ hay xuất hiện
    expect(parseStatementDate('01/08/2026', 'DD/MM/YYYY')).toBe('2026-08-01');
    expect(parseStatementDate('31/07/2026', 'DD/MM/YYYY')).toBe('2026-07-31');
    expect(parseStatementDate('31/12/2026', 'DD/MM/YYYY')).toBe('2026-12-31');
  });
});

describe('normalizeHeader', () => {
  it('cùng một cột viết nhiều kiểu đều khớp', () => {
    const expected = 'ngaygiaodich';
    expect(normalizeHeader('Ngày giao dịch')).toBe(expected);
    expect(normalizeHeader('NGAY GIAO DICH')).toBe(expected);
    expect(normalizeHeader('Ngay_giao_dich')).toBe(expected);
    expect(normalizeHeader('  Ngày  Giao  Dịch  ')).toBe(expected);
  });

  it('xử lý đ/Đ', () => {
    expect(normalizeHeader('Số dư đầu kỳ')).toBe('sodudauky');
  });

  it('bỏ ký tự BOM và dấu ngoặc kép còn sót từ CSV', () => {
    expect(normalizeHeader('﻿"Số tiền"')).toBe('sotien');
  });
});

describe('isFailedStatus', () => {
  it('nhận ra các trạng thái thất bại của MoMo và ngân hàng', () => {
    for (const status of [
      'Thất bại',
      'THAT BAI',
      'Không thành công',
      'Bị từ chối',
      'Đã hủy',
      'Đang xử lý',
      'Chờ xử lý',
      'Failed',
      'Rejected',
      'Cancelled',
      'Pending',
    ]) {
      expect(isFailedStatus(status), status).toBe(true);
    }
  });

  it('giữ lại mọi cách viết của trạng thái thành công', () => {
    for (const status of [
      'Thành công',
      'THANH CONG',
      'Đã thành công',
      'Giao dịch thành công',
      'Đã hoàn thành',
      'Hoàn tất',
      'Success',
      'Successful',
      'Completed',
    ]) {
      expect(isFailedStatus(status), status).toBe(false);
    }
  });

  it('ô trống không phải là thất bại — file không nói gì thì không suy diễn', () => {
    expect(isFailedStatus('')).toBe(false);
    expect(isFailedStatus('   ')).toBe(false);
    expect(isFailedStatus(null)).toBe(false);
    expect(isFailedStatus(undefined)).toBe(false);
  });

  it('trạng thái lạ được GIỮ, không bị bỏ', () => {
    // Đòi khớp whitelist "thành công" thì một cách viết lạ sẽ bỏ sạch cả file;
    // giữ lại thì người dùng còn thấy dòng đó ở preview và tự bỏ tick được.
    expect(isFailedStatus('OK')).toBe(false);
    expect(isFailedStatus('Đã ghi nhận')).toBe(false);
  });

  it('không nhầm vì mảnh chữ ngắn — "huy" nằm trong "chuyen"', () => {
    expect(isFailedStatus('Đã chuyển')).toBe(false);
    expect(isFailedStatus('Chuyển tiền thành công')).toBe(false);
  });
});

describe('isCardBillPayment', () => {
  it('nhận các cách gọi khoản trả nợ thẻ', () => {
    for (const text of [
      '513892xxxxxx4705-700006792802 - NGUYEN KIEU LINH - Thanh toan sao ke the Master Card 04/2026',
      'THANH TOAN SAO KE THE TIN DUNG',
      'TT sao ke thang 04',
      'Thanh toán dư nợ thẻ',
      'CREDIT CARD PAYMENT',
      'PAYMENT RECEIVED - THANK YOU',
    ]) {
      expect(isCardBillPayment(text), text).toBe(true);
    }
  });

  it('KHÔNG nhận giao dịch mua hàng bằng thẻ', () => {
    // Đây là ranh giới quan trọng nhất của hàm: khớp nhầm ở đây làm biến mất một
    // giao dịch thật khỏi lần import, và người dùng phải tự phát hiện ra là thiếu.
    for (const text of [
      'Thanh toan the tai WINMART',
      'Mua Hàng / Foody',
      'THANH TOAN QR VNPAY',
      'Thanh toan hoa don tien dien',
      'Thanh toan don hang Shopee',
    ]) {
      expect(isCardBillPayment(text), text).toBe(false);
    }
  });

  it('không nhận nhầm khoản hoàn tiền', () => {
    // Hoàn tiền cũng là tiền vào trên sao kê thẻ, nhưng nó là tiền thật được trả
    // lại chứ không phải tiền đổi chỗ — phải giữ.
    expect(isCardBillPayment('[700006792802] - Hoan tien giao dich Card on File ky thang 04/2026')).toBe(
      false,
    );
  });

  it('ô trống không suy diễn', () => {
    expect(isCardBillPayment('')).toBe(false);
    expect(isCardBillPayment('   ')).toBe(false);
    expect(isCardBillPayment(null)).toBe(false);
    expect(isCardBillPayment(undefined)).toBe(false);
  });
});

describe('isWalletTopup', () => {
  it('nhận các cách gọi việc nạp ví', () => {
    for (const text of [
      'NAP TIEN VI MOMO',
      'Nạp tiền vào ví ZaloPay',
      'Nap vi dien tu',
      'TOPUP WALLET',
    ]) {
      expect(isWalletTopup(text), text).toBe(true);
    }
  });

  it('KHÔNG nhận khoản chi tiêu qua ví', () => {
    // Tên ví có mặt trong mô tả của mọi khoản thanh toán qua ví. Khớp trên tên
    // ví trần sẽ nuốt sạch chi tiêu thật của người dùng.
    for (const text of [
      'MOMO Highlands Coffee',
      'Thanh toan ZaloPay Shopee',
      'VNPAY QR Circle K',
    ]) {
      expect(isWalletTopup(text), text).toBe(false);
    }
  });

  it('ô trống không suy diễn', () => {
    expect(isWalletTopup('')).toBe(false);
    expect(isWalletTopup(null)).toBe(false);
    expect(isWalletTopup(undefined)).toBe(false);
  });
});

describe('isSelfTransfer', () => {
  it('nhận cách viết nói rõ là nội bộ', () => {
    for (const text of [
      'CHUYEN KHOAN NOI BO',
      'Chuyển tiền giữa các tài khoản',
      'INTERNAL TRANSFER',
    ]) {
      expect(isSelfTransfer(text), text).toBe(true);
    }
  });

  it('KHÔNG nhận chuyển tiền thường', () => {
    // Phần lớn khoản chuyển tiền là trả cho người khác, tức chi tiêu thật. Đoán
    // từ 'chuyen tien' trần sẽ giấu mất phần lớn chi tiêu của người dùng.
    for (const text of [
      'CHUYEN TIEN CHO NGUYEN VAN A',
      'Chuyen khoan tra tien nha thang 07',
      'CK den NGUYEN THI B',
    ]) {
      expect(isSelfTransfer(text), text).toBe(false);
    }
  });
});
