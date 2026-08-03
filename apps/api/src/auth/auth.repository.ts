import { Injectable } from '@nestjs/common';
import type { TxType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
}

export interface UserCredentialsRow extends UserRow {
  passwordHash: string;
}

/** Danh mục mặc định gieo lúc đăng ký. */
export interface CategorySeed {
  name: string;
  type: TxType;
  icon: string;
  color: string;
  sortOrder: number;
}

/** Rule auto-categorize mặc định, dựng từ id của danh mục vừa tạo. */
export interface RuleSeed {
  keyword: string;
  categoryId: string;
  priority: number;
}

export interface CreatedCategory {
  id: string;
  name: string;
  type: TxType;
}

/** Mọi truy vấn DB liên quan tới user. */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findIdByEmail(email: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
  }

  findCredentialsByEmail(email: string): Promise<UserCredentialsRow | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, passwordHash: true },
    });
  }

  findById(userId: string): Promise<UserRow | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
  }

  /**
   * Tạo user cùng bộ danh mục mặc định và rule của chúng, trong MỘT transaction.
   *
   * Một tài khoản tồn tại mà không có danh mục nào là trạng thái không dùng
   * được, nên không được để nó xảy ra dù chỉ tạm thời.
   *
   * `rulesFor` là callback vì rule cần id của category vừa tạo — id chỉ có sau
   * khi ghi, mà việc ghép keyword vào danh mục nào là quyết định nghiệp vụ nên
   * nó ở lại service.
   */
  createUserWithDefaults(
    data: { email: string; passwordHash: string; name: string | null },
    categories: CategorySeed[],
    rulesFor: (created: CreatedCategory[]) => RuleSeed[],
  ): Promise<UserRow> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          passwordHash: data.passwordHash,
          name: data.name,
        },
        select: { id: true, email: true, name: true },
      });

      await tx.category.createMany({
        data: categories.map((category) => ({
          userId: created.id,
          name: category.name,
          type: category.type,
          icon: category.icon,
          color: category.color,
          sortOrder: category.sortOrder,
        })),
      });

      // Rule auto-categorize: cần id của category vừa tạo nên phải đọc lại.
      const categoryRows = await tx.category.findMany({
        where: { userId: created.id },
        select: { id: true, name: true, type: true },
      });

      const rules = rulesFor(categoryRows);

      if (rules.length > 0) {
        await tx.categoryRule.createMany({
          data: rules.map((rule) => ({
            userId: created.id,
            keyword: rule.keyword,
            categoryId: rule.categoryId,
            priority: rule.priority,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });
  }
}
