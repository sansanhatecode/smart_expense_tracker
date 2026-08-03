import { Injectable } from '@nestjs/common';
import { fromDateOnly } from '../common/mappers';
import { Prisma } from '../generated/prisma/client';
import type { TxType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const BUDGET_SELECT = {
  id: true,
  month: true,
  limitAmount: true,
  category: {
    select: { id: true, name: true, type: true, icon: true, color: true, sortOrder: true },
  },
} as const;

export type BudgetRow = Prisma.BudgetGetPayload<{ select: typeof BUDGET_SELECT }>;

export interface BudgetUpsert {
  categoryId: string;
  /** 'YYYY-MM' */
  month: string;
  limitAmount: bigint;
}

/** Mọi truy vấn DB của module ngân sách. */
@Injectable()
export class BudgetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByMonth(userId: string, month: string): Promise<BudgetRow[]> {
    return this.prisma.budget.findMany({
      where: { userId, month },
      select: BUDGET_SELECT,
      orderBy: { category: { sortOrder: 'asc' } },
    });
  }

  /** Upsert theo khoá (user, danh mục, kỳ) — xem chú thích ở service. */
  upsert(userId: string, input: BudgetUpsert): Promise<BudgetRow> {
    return this.prisma.budget.upsert({
      where: {
        userId_categoryId_month: {
          userId,
          categoryId: input.categoryId,
          month: input.month,
        },
      },
      create: {
        userId,
        categoryId: input.categoryId,
        month: input.month,
        limitAmount: input.limitAmount,
      },
      update: { limitAmount: input.limitAmount },
      select: BUDGET_SELECT,
    });
  }

  findOwned(userId: string, id: string): Promise<{ id: string } | null> {
    return this.prisma.budget.findFirst({
      where: { id, userId },
      select: { id: true },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.budget.delete({ where: { id } });
  }

  findOwnedCategory(
    userId: string,
    categoryId: string,
  ): Promise<{ id: string; type: TxType; name: string } | null> {
    return this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true, type: true, name: true },
    });
  }

  /**
   * Số đã chi trong kỳ, nhóm theo danh mục.
   *
   * Một câu GROUP BY cho cả kỳ, không phải một query cho mỗi budget: với 11
   * danh mục chi thì cách kia là 11 round-trip cho một trang duy nhất.
   */
  async spentByCategory(
    userId: string,
    from: string,
    to: string,
  ): Promise<Map<string, bigint>> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: 'expense',
        date: { gte: fromDateOnly(from), lte: fromDateOnly(to) },
        categoryId: { not: null },
        // Cùng định nghĩa "chi tiêu thật" với stats. Thiếu điều kiện này thì một
        // khoản trả nợ thẻ rơi vào danh mục 'Chuyển tiền' sẽ ăn hết ngân sách
        // của danh mục đó, dù người dùng chưa tiêu thêm đồng nào.
        internalKind: null,
      },
      _sum: { amount: true },
    });

    const spent = new Map<string, bigint>();
    for (const row of rows) {
      if (row.categoryId && row._sum.amount !== null) {
        spent.set(row.categoryId, row._sum.amount);
      }
    }
    return spent;
  }

  async spentForCategory(
    userId: string,
    categoryId: string,
    from: string,
    to: string,
  ): Promise<bigint> {
    const result = await this.prisma.transaction.aggregate({
      where: {
        userId,
        categoryId,
        type: 'expense',
        date: { gte: fromDateOnly(from), lte: fromDateOnly(to) },
        internalKind: null,
      },
      _sum: { amount: true },
    });

    return result._sum.amount ?? 0n;
  }
}
