import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  loginSchema,
  registerSchema,
  type AuthResponse,
  type LoginInput,
  type RegisterInput,
  type UserDto,
} from '@expense/shared';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService, type AuthResult } from './auth.service';
import { CurrentUserId } from './current-user.decorator';
import { Public } from './jwt-auth.guard';
import { REFRESH_COOKIE_NAME, clearRefreshCookie, setRefreshCookie } from './refresh-cookie';
import { TokenService, type TokenContext } from './token.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  // Siết chặt hơn mức mặc định của app: đây là chỗ bị brute-force.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.register(body, contextOf(request));
    return this.respondWithTokens(result, response);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.login(body, contextOf(request));
    return this.respondWithTokens(result, response);
  }

  /**
   * Đổi refresh cookie lấy access token mới.
   *
   * Public vì access token cũ đã hết hạn thì request này không mang được token
   * hợp lệ — chính cookie là thứ xác thực ở đây.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const rawToken = readRefreshCookie(request);

    if (!rawToken) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    try {
      const issued = await this.tokens.rotate(rawToken, contextOf(request));
      return this.respondWithTokens(issued, response);
    } catch (error) {
      // Rotate thất bại thì cookie hiện tại vô dụng — xoá luôn để FE không thử
      // lại vô ích trong vòng lặp refresh.
      clearRefreshCookie(response);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const rawToken = readRefreshCookie(request);

    if (rawToken) {
      await this.tokens.revokeByRawToken(rawToken);
    }

    // Xoá cookie kể cả khi không có token: logout phải luôn thành công, không
    // có lý do gì báo lỗi cho người đang muốn đăng xuất.
    clearRefreshCookie(response);
  }

  @Get('me')
  async me(@CurrentUserId() userId: string): Promise<UserDto> {
    return this.auth.me(userId);
  }

  /** Refresh token đi bằng cookie, không bao giờ nằm trong body response. */
  private respondWithTokens(result: AuthResult, response: Response): AuthResponse {
    setRefreshCookie(response, result.refreshToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }
}

function contextOf(request: Request): TokenContext {
  return {
    userAgent: request.headers['user-agent'],
    ip: request.ip,
  };
}

function readRefreshCookie(request: Request): string | null {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_COOKIE_NAME] ?? null;
}
