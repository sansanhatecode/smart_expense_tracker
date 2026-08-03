import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { newRequestId, runWithRequestContext } from './request-context';

const logger = new Logger('HTTP');

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Id do client gửi lên chỉ được nhận nếu "sạch".
 *
 * Giá trị này đi vào cả log lẫn response header, nên nếu nhận nguyên xi thì
 * người gọi có thể nhét newline vào để bịa ra dòng log giả, hoặc chèn header
 * khác. Không sạch thì bỏ, tự sinh id mới — không có lý do gì phải báo lỗi.
 */
const SAFE_REQUEST_ID = /^[\w.:-]{1,64}$/;

/**
 * Những path bị gọi liên tục bởi uptime check. Vẫn log nhưng ở mức debug: ở
 * production chúng biến mất khỏi log, không làm loãng traffic thật.
 */
const QUIET_PATHS = new Set(['/health']);

/**
 * Access log cho mọi request, kèm request id để tương quan các dòng log.
 *
 * Cố tình là middleware Express chứ không phải Nest interceptor: interceptor
 * chạy SAU guard, nên request bị chặn ở JwtAuthGuard (401) hay ThrottlerGuard
 * (429) sẽ không được log lần nào — mà đó đúng là loại request cần thấy nhất khi
 * đi debug "sao tôi không vào được". Middleware thì thấy hết, kể cả 404 của
 * route không tồn tại.
 *
 * KHÔNG log body: body của /auth/login và /auth/register chứa mật khẩu thật.
 * Một access log tưởng như vô hại lại là chỗ rò mật khẩu phổ biến nhất.
 */
export function httpLogger(request: Request, response: Response, next: NextFunction): void {
  const requestId = readRequestId(request) ?? newRequestId();
  const startedAt = process.hrtime.bigint();

  // Trả id về cho client để khi người dùng báo lỗi, họ đưa được mã tra log.
  response.setHeader('X-Request-Id', requestId);

  runWithRequestContext({ requestId }, () => {
    let logged = false;

    const logOnce = (aborted: boolean): void => {
      if (logged) return;
      logged = true;

      const durationMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
      // `user` chỉ có sau khi guard verify token xong, nên phải đọc ở đây chứ
      // không phải lúc request mới vào.
      const userId = (request as AuthenticatedRequest).user?.id;
      const status = aborted ? 'ABORT' : response.statusCode;

      const line =
        `${request.method} ${request.originalUrl} → ${status} ${durationMs}ms` +
        `${userId ? ` user=${userId}` : ''} req=${requestId} ip=${request.ip ?? '-'}`;

      if (QUIET_PATHS.has(request.path)) {
        logger.debug(line);
      } else if (!aborted && response.statusCode >= 500) {
        logger.error(line);
      } else if (aborted || response.statusCode >= 400) {
        logger.warn(line);
      } else {
        logger.log(line);
      }
    };

    // 'finish' = response đã gửi xong. 'close' bắt trường hợp client ngắt giữa
    // đường (thường gặp khi upload file import bị huỷ) — không có nó thì những
    // request đó im lặng biến mất khỏi log.
    response.on('finish', () => logOnce(false));
    response.on('close', () => logOnce(!response.writableFinished));

    next();
  });
}

function readRequestId(request: Request): string | null {
  const header = request.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;

  if (!value || !SAFE_REQUEST_ID.test(value)) return null;

  return value;
}
