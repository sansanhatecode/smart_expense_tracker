import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { TokenRepository } from './token.repository';

export interface AccessTokenPayload {
  /** userId */
  sub: string;
  email: string;
}

export interface IssuedTokens {
  accessToken: string;
  /** Số giây access token còn hiệu lực — FE dùng để hẹn giờ silent refresh. */
  expiresIn: number;
  /** Chuỗi gốc, chỉ tồn tại trong response này. DB chỉ giữ hash của nó. */
  refreshToken: string;
}

export interface RotatedTokens extends IssuedTokens {
  /** Trả kèm user để controller không phải query lại thứ vừa đọc xong. */
  user: { id: string; email: string; name: string | null };
}

export interface TokenContext {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

/**
 * Refresh token rotation có reuse detection.
 *
 * Mô hình "token family": mỗi lần login mở một family mới. Mỗi lần refresh thì
 * token cũ bị revoke và trỏ `replacedById` sang token mới, tạo thành một chuỗi.
 *
 * Điều làm cơ chế này có giá trị: nếu một token ĐÃ revoke lại được dùng, chỉ có
 * hai khả năng — hoặc token bị đánh cắp và kẻ tấn công đang dùng lại, hoặc
 * người dùng thật đang dùng bản sao cũ. Cả hai trường hợp đều không phân biệt
 * được từ phía server, nên xử lý an toàn nhất là revoke TOÀN BỘ family và buộc
 * login lại. Kẻ tấn công mất quyền, và người dùng thật chỉ mất công đăng nhập.
 *
 * Một refresh flow chỉ kiểm tra "token còn hạn không" thì tệ hơn không có
 * refresh token, vì nó tạo cảm giác an toàn mà không có cách thu hồi.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly tokens: TokenRepository,
    private readonly jwt: JwtService,
  ) {}

  /** Chỉ lưu hash: DB bị đọc cũng không dùng được token nào. */
  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private generateRawToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  }

  private async signAccessToken(userId: string, email: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const payload: AccessTokenPayload = { sub: userId, email };
    const accessToken = await this.jwt.signAsync(payload);

    // Lấy expiresIn từ chính `exp` của token thay vì tự parse '15m' — không thể
    // lệch với thứ đã ký.
    const decoded = this.jwt.decode<{ exp?: number }>(accessToken);
    const expiresIn = decoded?.exp
      ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000))
      : 900;

    return { accessToken, expiresIn };
  }

  /** Login/register: mở một family mới. */
  async issueNewFamily(
    userId: string,
    email: string,
    context: TokenContext,
  ): Promise<IssuedTokens> {
    const rawToken = this.generateRawToken();

    await this.tokens.create({
      userId,
      tokenHash: this.hashToken(rawToken),
      familyId: randomUUID(),
      expiresAt: this.refreshExpiry(),
      userAgent: context.userAgent ?? null,
      ip: context.ip ?? null,
    });

    const { accessToken, expiresIn } = await this.signAccessToken(userId, email);
    return { accessToken, expiresIn, refreshToken: rawToken };
  }

  /**
   * Đổi refresh token cũ lấy cặp token mới, trong cùng family.
   *
   * Ném UnauthorizedException với message giống nhau cho mọi lý do thất bại —
   * không nói cho phía gọi biết là "token không tồn tại" hay "token đã bị
   * revoke", vì đó là thông tin có ích cho kẻ đang thăm dò.
   */
  async rotate(rawToken: string, context: TokenContext): Promise<RotatedTokens> {
    const existing = await this.tokens.findByHash(this.hashToken(rawToken));

    if (!existing) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    // ─── Reuse detection ───
    if (existing.revokedAt !== null) {
      this.logger.warn(
        `Phát hiện dùng lại refresh token đã revoke (user ${existing.userId}, ` +
          `family ${existing.familyId}) — revoke toàn bộ family`,
      );
      await this.tokens.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    const rawNext = this.generateRawToken();

    await this.tokens.rotate(existing.id, {
      userId: existing.userId,
      tokenHash: this.hashToken(rawNext),
      familyId: existing.familyId,
      expiresAt: this.refreshExpiry(),
      userAgent: context.userAgent ?? null,
      ip: context.ip ?? null,
    });

    const { accessToken, expiresIn } = await this.signAccessToken(
      existing.user.id,
      existing.user.email,
    );

    return { accessToken, expiresIn, refreshToken: rawNext, user: existing.user };
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.tokens.revokeFamily(familyId);
  }

  /** Logout: revoke cả family, không chỉ token hiện tại. */
  async revokeByRawToken(rawToken: string): Promise<void> {
    const existing = await this.tokens.findFamilyByHash(this.hashToken(rawToken));

    if (existing) {
      await this.tokens.revokeFamily(existing.familyId);
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.tokens.revokeAllForUser(userId);
  }

  /**
   * Dọn token đã hết hạn hoặc đã revoke lâu. Gọi lazy khi login, không cần cron.
   * Giữ lại token revoked trong 7 ngày để reuse detection còn tác dụng — xoá
   * ngay thì token bị đánh cắp lại thành "không tồn tại" thay vì "đã revoke",
   * và ta mất tín hiệu để revoke cả family.
   */
  cleanupExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.tokens.deleteExpiredBefore(cutoff);
  }
}
