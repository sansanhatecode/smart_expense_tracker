/**
 * Biểu đồ.
 *
 * Quy tắc màu, hình dạng mark, và cách chọn form đều theo một bộ nguyên tắc
 * data-viz, và bảng màu đã qua validator (xem globals.css). Ba điểm đáng nhắc:
 *
 *   Thu = xanh, Chi = cam. Cố tình KHÔNG dùng đỏ/xanh-lá — đó đúng là trục mà
 *   dạng mù màu phổ biến nhất không đọc được. Cặp xanh/cam đạt CVD ΔE 24.7.
 *
 *   Breakdown theo danh mục là BAR NGANG một màu, không phải biểu đồ tròn. Với
 *   11 danh mục thì tròn không đọc được, và không tồn tại 11 màu phân biệt được.
 *   Tên danh mục trên trục mang identity, độ dài bar mang độ lớn.
 *
 *   Trạng thái luôn kèm icon + chữ, không bao giờ chỉ có màu.
 *
 * File này chỉ gom cửa ra: mỗi biểu đồ nằm ở file riêng cùng thư mục.
 */

export { cn } from '@/lib/utils';

export { StatTile } from './StatTile';
export { TrendChart } from './TrendChart';
export { BreakdownBars, accountBar, categoryBar, type BreakdownBarItem } from './BreakdownBars';
export { BudgetAlertRow, BudgetMeter } from './BudgetMeter';
