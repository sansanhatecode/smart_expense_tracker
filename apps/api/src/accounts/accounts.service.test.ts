import { describe, expect, it } from 'vitest';
import { currentPeriodOf } from './accounts.service';

/** Ngày lịch → Date ở UTC midnight, cùng quy ước với cột DATE. */
function on(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('currentPeriodOf', () => {
  it('chưa khai ngày chốt thì không bịa ra kỳ', () => {
    expect(currentPeriodOf(null, null, on('2026-08-03'))).toBeNull();
    // Có ngày đến hạn nhưng thiếu ngày chốt cũng vậy: không biết kỳ bắt đầu từ đâu.
    expect(currentPeriodOf(null, 20, on('2026-08-03'))).toBeNull();
  });

  it('trước ngày chốt: kỳ kết thúc trong tháng này', () => {
    expect(currentPeriodOf(5, null, on('2026-08-03'))).toMatchObject({
      from: '2026-07-06',
      to: '2026-08-05',
    });
  });

  it('đúng ngày chốt vẫn thuộc kỳ đang chạy', () => {
    // Ranh giới: kỳ kết thúc VÀO ngày chốt, không phải trước nó.
    expect(currentPeriodOf(5, null, on('2026-08-05'))).toMatchObject({
      from: '2026-07-06',
      to: '2026-08-05',
    });
  });

  it('sau ngày chốt: kỳ mới đã bắt đầu', () => {
    expect(currentPeriodOf(5, null, on('2026-08-06'))).toMatchObject({
      from: '2026-08-06',
      to: '2026-09-05',
    });
  });

  it('vắt qua năm', () => {
    expect(currentPeriodOf(5, null, on('2026-12-20'))).toMatchObject({
      from: '2026-12-06',
      to: '2027-01-05',
    });
  });

  it('ngày chốt 31 được kẹp về ngày cuối tháng ngắn', () => {
    // Tháng 2 không có ngày 31. Tràn sang tháng 3 sẽ làm kỳ dài thêm mấy ngày.
    expect(currentPeriodOf(31, null, on('2026-02-15'))).toMatchObject({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('ngày đến hạn sau ngày chốt thì cùng tháng với ngày chốt', () => {
    expect(currentPeriodOf(5, 20, on('2026-08-03'))).toMatchObject({
      to: '2026-08-05',
      dueDate: '2026-08-20',
    });
  });

  it('ngày đến hạn nhỏ hơn ngày chốt thì rơi sang tháng sau', () => {
    // Chốt ngày 25, đến hạn ngày 10 — nghĩa là ngày 10 của tháng KẾ TIẾP. Hiểu
    // sai chỗ này sẽ báo hạn đã qua trong khi người dùng còn hơn hai tuần.
    expect(currentPeriodOf(25, 10, on('2026-08-03'))).toMatchObject({
      to: '2026-08-25',
      dueDate: '2026-09-10',
    });
  });

  it('không khai ngày đến hạn thì chỉ thiếu dueDate, kỳ vẫn tính được', () => {
    const period = currentPeriodOf(5, null, on('2026-08-03'));
    expect(period?.dueDate).toBeNull();
    expect(period?.from).toBe('2026-07-06');
  });
});
