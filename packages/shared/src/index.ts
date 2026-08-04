/**
 * Contract giữa apps/web và apps/api.
 *
 * Cả hai đầu import từ đây, nên nếu contract lệch thì lỗi xuất hiện lúc
 * compile chứ không phải lúc chạy. Đây là thứ thay thế OpenAPI codegen sau
 * khi tách FE/BE — xem ADR 9.1.
 *
 * Quy ước qua dây:
 *   - Tiền     → `number` nguyên VND, luôn dương; chiều nằm ở `type`
 *   - Ngày GD  → string 'YYYY-MM-DD' (cột DB là DATE, không phải instant)
 *   - Kỳ       → string 'YYYY-MM'
 *   - Timestamp→ string ISO 8601 (createdAt, confirmedAt, …)
 */

export * from './money';
export * from './common';
export * from './schemas/auth';
export * from './schemas/account';
export * from './schemas/category';
export * from './schemas/transaction';
export * from './schemas/import';
export * from './schemas/budget';
export * from './schemas/stats';
export * from './schemas/feedback';
