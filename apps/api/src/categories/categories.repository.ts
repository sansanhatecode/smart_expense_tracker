import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { TxType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const CATEGORY_SELECT = {
  id: true,
  name: true,
  type: true,
  icon: true,
  color: true,
  sortOrder: true,
} as const;

const CATEGORY_WITH_COUNT_SELECT = {
  ...CATEGORY_SELECT,
  _count: { select: { transactions: true } },
} as const;

const RULE_SELECT = {
  id: true,
  keyword: true,
  priority: true,
  category: { select: CATEGORY_SELECT },
} as const;

export type CategoryRow = Prisma.CategoryGetPayload<{ select: typeof CATEGORY_SELECT }>;

export type CategoryWithCountRow = Prisma.CategoryGetPayload<{
  select: typeof CATEGORY_WITH_COUNT_SELECT;
}>;

export type RuleRow = Prisma.CategoryRuleGetPayload<{ select: typeof RULE_SELECT }>;

export interface CategoryInsert {
  name: string;
  type: TxType;
  icon: string;
  color: string;
  sortOrder: number;
}

/** `undefined` là "không đổi". */
export interface CategoryPatch {
  name?: string;
  type?: TxType;
  icon?: string;
  color?: string;
  sortOrder?: number;
}

export interface RuleInsert {
  keyword: string;
  categoryId: string;
  priority: number;
}

export interface RulePatch {
  keyword?: string;
  categoryId?: string;
  priority?: number;
}

/** Mọi truy vấn DB của module danh mục và rule auto-categorize. */
@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string): Promise<CategoryWithCountRow[]> {
    return this.prisma.category.findMany({
      where: { userId },
      select: CATEGORY_WITH_COUNT_SELECT,
      // Thu trước chi, rồi theo sortOrder — thứ tự ổn định để UI không nhảy.
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  create(userId: string, input: CategoryInsert): Promise<CategoryRow> {
    return this.prisma.category.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder,
      },
      select: CATEGORY_SELECT,
    });
  }

  /** Lọc theo userId ngay trong where — đây là chỗ chặn đọc danh mục người khác. */
  findOwned(
    userId: string,
    id: string,
  ): Promise<{ id: string; type: TxType; _count: { transactions: number } } | null> {
    return this.prisma.category.findFirst({
      where: { id, userId },
      select: { id: true, type: true, _count: { select: { transactions: true } } },
    });
  }

  update(id: string, patch: CategoryPatch): Promise<CategoryRow> {
    return this.prisma.category.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      },
      select: CATEGORY_SELECT,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }

  // ─── Rule auto-categorize ──────────────────────────────────────────────────

  findAllRules(userId: string): Promise<RuleRow[]> {
    return this.prisma.categoryRule.findMany({
      where: { userId },
      select: RULE_SELECT,
      // priority cao trước, để danh sách hiển thị đúng thứ tự thắng khi khớp.
      orderBy: [{ priority: 'desc' }, { keyword: 'asc' }],
    });
  }

  createRule(userId: string, input: RuleInsert): Promise<RuleRow> {
    return this.prisma.categoryRule.create({
      data: {
        userId,
        keyword: input.keyword,
        categoryId: input.categoryId,
        priority: input.priority,
      },
      select: RULE_SELECT,
    });
  }

  findOwnedRule(userId: string, id: string): Promise<{ id: string } | null> {
    return this.prisma.categoryRule.findFirst({
      where: { id, userId },
      select: { id: true },
    });
  }

  updateRule(id: string, patch: RulePatch): Promise<RuleRow> {
    return this.prisma.categoryRule.update({
      where: { id },
      data: {
        ...(patch.keyword !== undefined ? { keyword: patch.keyword } : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      },
      select: RULE_SELECT,
    });
  }

  async deleteRule(id: string): Promise<void> {
    await this.prisma.categoryRule.delete({ where: { id } });
  }
}
