import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Bản ghi refresh token, KÈM user để phía gọi không phải query lại. */
export interface RefreshTokenRow {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  user: { id: string; email: string; name: string | null };
}

export interface RefreshTokenInsert {
  userId: string;
  /** Chỉ hash, không bao giờ là chuỗi gốc. */
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

/**
 * Mọi truy vấn DB của refresh token.
 *
 * Chỉ nhận và trả HASH của token, không bao giờ chuỗi gốc: việc băm nằm ở
 * TokenService, nên tầng này không có đường nào chạm vào bí mật.
 */
@Injectable()
export class TokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: RefreshTokenInsert): Promise<void> {
    await this.prisma.refreshToken.create({ data: input });
  }

  findByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }

  findFamilyByHash(tokenHash: string): Promise<{ familyId: string } | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { familyId: true },
    });
  }

  /**
   * Tạo token mới và revoke token cũ trong cùng một transaction.
   *
   * Rotation phải nguyên tử: nếu tạo được token mới mà không revoke được token
   * cũ thì hai token cùng sống, và reuse detection mất tác dụng.
   */
  async rotate(previousId: string, next: RefreshTokenInsert): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({ data: next });

      await tx.refreshToken.update({
        where: { id: previousId },
        data: { revokedAt: new Date(), replacedById: created.id },
      });
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Xoá token hết hạn hoặc đã revoke trước mốc `cutoff`. Trả về số dòng đã xoá. */
  async deleteExpiredBefore(cutoff: Date): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
      },
    });

    return result.count;
  }
}
