/**
 * Che email trước khi đưa vào log: `bnhlinh2003@gmail.com` → `bn***@gmail.com`.
 *
 * Log của một app chi tiêu cá nhân sẽ đi qua nhiều chỗ (stdout của Render, log
 * aggregator, screenshot dán vào issue). Email đầy đủ ở đó là PII không cần
 * thiết: để debug chỉ cần biết "cùng một người" và "đúng cái email tôi đã nhập
 * chứ không phải cái tôi gõ sai" — hai ký tự đầu và domain là đủ cho cả hai.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');

  // Không có '@' thì đây không phải email đã qua validate — che sạch, vì không
  // biết nó là cái gì thì càng không nên ghi ra log.
  if (at <= 0) return '***';

  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, 2);

  return `${visible}***${domain}`;
}
