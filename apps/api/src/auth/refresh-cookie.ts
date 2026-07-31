import type { CookieOptions, Response } from 'express';
import { env, isProduction } from '../config/env';

export const REFRESH_COOKIE_NAME = 'expense_refresh';

/**
 * Refresh token nằm trong cookie httpOnly nên JS của FE không đọc được nó —
 * nếu có XSS thì kẻ tấn công vẫn không lấy được token dài hạn.
 *
 * `sameSite` phải khác nhau giữa dev và production, và lý do đáng ghi lại:
 *
 * - Dev: web ở localhost:3000, api ở localhost:3001. Khác *origin* nhưng CÙNG
 *   site (cùng registrable domain "localhost"), nên `lax` vẫn được gửi kèm. Và
 *   `secure` phải tắt vì dev chạy http.
 * - Production: web ở vercel.app, api ở onrender.com — khác site thật, nên buộc
 *   phải `none` + `secure`.
 *
 * Đặt cứng `none` cho cả hai sẽ làm cookie bị chặn ở dev vì thiếu HTTPS.
 */
function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    // Chỉ gửi cookie tới các route auth — endpoint khác không cần thấy nó.
    path: '/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

export function setRefreshCookie(response: Response, token: string): void {
  response.cookie(REFRESH_COOKIE_NAME, token, cookieOptions());
}

export function clearRefreshCookie(response: Response): void {
  // maxAge không dùng khi clear, nhưng các thuộc tính còn lại phải khớp y hệt
  // lúc set, nếu không browser sẽ coi là cookie khác và không xoá.
  const { maxAge: _maxAge, ...options } = cookieOptions();
  response.clearCookie(REFRESH_COOKIE_NAME, options);
}
