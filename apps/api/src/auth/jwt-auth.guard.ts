import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AccessTokenPayload } from './token.service';

const IS_PUBLIC_KEY = 'isPublic';

/** Đánh dấu route không cần đăng nhập. Mặc định là CẦN — xem chú thích guard. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

export interface AuthenticatedUser {
  id: string;
  email: string;
}

/** Request đã qua guard thì chắc chắn có `user`. */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

/**
 * Guard đăng ký toàn cục, nên **mặc định mọi route đều cần đăng nhập** và phải
 * mở ra tường minh bằng `@Public()`.
 *
 * Chiều mặc định này là có chủ ý: nếu mặc định là mở và phải nhớ gắn guard cho
 * từng route, thì một endpoint mới bị quên sẽ lộ dữ liệu ra ngoài. Còn quên
 * `@Public()` thì chỉ làm route đó trả 401 — lỗi thấy ngay và vô hại.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Cần đăng nhập');
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      (request as AuthenticatedRequest).user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      // Không phân biệt "token sai" với "token hết hạn" trong message trả ra.
      // FE nhận 401 thì gọi /auth/refresh, không cần biết lý do cụ thể.
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    }
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;

  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;

  return value;
}
