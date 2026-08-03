import type { ParseResult } from './types';

/**
 * Ứng viên profile này có tốt hơn ứng viên đang giữ ngôi không?
 *
 * Số dòng đọc được là tiêu chí chính; chữ ký cột chỉ dùng để phá thế hoà. Thứ
 * tự đó là có chủ ý: đọc sót dữ liệu của người dùng tệ hơn nhiều so với việc
 * gọi sai tên loại nguồn tiền, thứ họ sửa được ở trang Nguồn tiền.
 *
 * Điều kiện phá hoà cố tình KHÔNG đối xứng — ứng viên phải khớp chữ ký còn
 * đương kim thì không. Nhờ vậy thứ tự trong AUTO_DETECT_CANDIDATES vẫn quyết
 * định khi cả hai đều không có chữ ký, tức profile tổng quát thắng mặc định.
 *
 * Nằm ở module riêng thay vì trong imports.service để test dò profile không
 * phải dựng cả NestJS và Prisma lên.
 */
export function beatsBest(candidate: ParseResult, current: ParseResult): boolean {
  if (candidate.rows.length !== current.rows.length) {
    return candidate.rows.length > current.rows.length;
  }
  return candidate.signatureMatched && !current.signatureMatched;
}
