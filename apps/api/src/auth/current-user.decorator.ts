import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from './jwt-auth.guard';

/**
 * Lấy user đã xác thực từ request.
 *
 * `@CurrentUser() user: AuthenticatedUser` — luôn có giá trị, vì JwtAuthGuard
 * chạy trước và chặn mọi request không có token hợp lệ.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);

/**
 * Lấy thẳng userId — dùng nhiều nhất, vì mọi query đều phải lọc theo nó để
 * chống IDOR.
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user.id;
  },
);
