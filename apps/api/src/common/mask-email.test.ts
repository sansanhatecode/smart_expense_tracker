import { describe, expect, it } from 'vitest';
import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('giữ 2 ký tự đầu và domain — đủ để nhận ra người quen mà không ghi cả email', () => {
    expect(maskEmail('bnhlinh2003@gmail.com')).toBe('bn***@gmail.com');
  });

  it('giữ domain để phân biệt gõ sai domain — lỗi login rất hay gặp', () => {
    expect(maskEmail('an@gmai.com')).toBe('an***@gmai.com');
    expect(maskEmail('an@gmail.com')).toBe('an***@gmail.com');
  });

  it('không làm lộ local part ngắn hơn 2 ký tự', () => {
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });

  it('che sạch chuỗi không phải email', () => {
    // Không qua validate thì không biết nó là gì — có thể là cả password bị
    // truyền lẫn chỗ. Ghi ra log là rủi ro không cần thiết.
    expect(maskEmail('')).toBe('***');
    expect(maskEmail('khong-phai-email')).toBe('***');
    expect(maskEmail('@no-local-part.com')).toBe('***');
  });

  it('lấy dấu @ cuối cùng làm mốc, nên domain luôn đúng', () => {
    // 2 ký tự đầu ở đây là "a@" vì local part là "a@b" — trông lạ nhưng vẫn
    // đúng mục đích: domain hiện chính xác, phần còn lại bị che.
    expect(maskEmail('a@b@gmail.com')).toBe('a@***@gmail.com');
  });
});
