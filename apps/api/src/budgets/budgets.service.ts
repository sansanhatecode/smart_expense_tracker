import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  budgetStatusOf,
  numberToBigint,
  type BudgetAlertDto,
  type BudgetDto,
  type UpsertBudgetInput,
} from '@expense/shared';
import { toMoney } from '../common/mappers';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const BUDGET_SELECT = {
  id: true,
  month: true,
  limitAmount: true,
  category: {
    select: { id: true, name: true, type: true, icon: true, color: true, sortOrder: true },
  },
} as const;

type BudgetRow = Prisma.BudgetGetPayload<{ select: typeof BUDGET_SELECT }>;

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ngân sách của một kỳ, kèm số đã chi tính từ DB.
   *
   * `spent` được tổng hợp bằng một câu GROUP BY cho cả kỳ, không phải một query
   * cho mỗi budget: với 11 danh mục chi thì cách kia là 11 round-trip cho một
   * trang duy nhất.
   */
  async list(userId: string, month?: string): Promise<BudgetDto[]> {
    const period = month ?? currentMonthIct();
    const { from, to } = monthBounds(period);

    const [budgets, spentByCategory] = await Promise.all([
      this.prisma.budget.findMany({
        where: { userId, month: period },
        select: BUDGET_SELECT,
        orderBy: { category: { sortOrder: 'asc' } },
      }),
      this.spentByCategory(userId, from, to),
    ]);

    return budgets.map((budget) => toBudgetDto(budget, spentByCategory.get(budget.category.id) ?? 0));
  }

  /**
   * Tạo hoặc cập nhật ngân sách của (danh mục, kỳ).
   *
   * Là upsert chứ không phải create riêng và update riêng: từ góc nhìn người dùng,
   * "đặt ngân sách 3 triệu cho Ăn uống tháng 8" là một hành động, và họ không cần
   * biết là đã từng đặt hay chưa.
   */
  async upsert(userId: string, input: UpsertBudgetInput): Promise<BudgetDto> {
    const category = await this.prisma.category.findFirst({
      where: { id: input.categoryId, userId },
      select: { id: true, type: true, name: true },
    });

    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }

    // Ngân sách chỉ có nghĩa với danh mục CHI. Đặt ngân sách cho "Lương" là vô
    // nghĩa, và cho phép nó sẽ sinh ra những dòng luôn hiện 0% mãi mãi.
    if (category.type !== 'expense') {
      throw new BadRequestException(
        `"${category.name}" là danh mục thu — ngân sách chỉ đặt được cho danh mục chi`,
      );
    }

    const budget = await this.prisma.budget.upsert({
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
        limitAmount: numberToBigint(input.limitAmount),
      },
      update: { limitAmount: numberToBigint(input.limitAmount) },
      select: BUDGET_SELECT,
    });

    const { from, to } = monthBounds(input.month);
    const spent = await this.spentForCategory(userId, input.categoryId, from, to);

    return toBudgetDto(budget, spent);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.budget.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy ngân sách');
    }

    await this.prisma.budget.delete({ where: { id } });
  }

  /**
   * Chỉ những ngân sách đang cảnh báo hoặc đã vượt.
   *
   * Có endpoint riêng thay vì để FE lọc từ `list`: dashboard cần đúng thông tin
   * này và không cần cả danh sách, còn ngưỡng cảnh báo thì được định nghĩa một
   * chỗ trong `packages/shared` nên FE và BE không thể lệch nhau về nghĩa của
   * "sắp vượt".
   */
  async alerts(userId: string, month?: string): Promise<BudgetAlertDto[]> {
    const budgets = await this.list(userId, month);

    return budgets
      .filter((budget) => budget.status !== 'ok')
      .map((budget) => ({
        budgetId: budget.id,
        categoryName: budget.category.name,
        categoryColor: budget.category.color,
        categoryIcon: budget.category.icon,
        month: budget.month,
        limitAmount: budget.limitAmount,
        spent: budget.spent,
        status: budget.status as 'warning' | 'over',
      }))
      // Vượt nhiều nhất lên trước: đó là thứ người dùng cần thấy đầu tiên.
      .sort((a, b) => b.spent / b.limitAmount - a.spent / a.limitAmount);
  }

  private async spentByCategory(
    userId: string,
    from: string,
    to: string,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: 'expense',
        date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
        categoryId: { not: null },
        // Cùng định nghĩa "chi tiêu thật" với stats. Thiếu điều kiện này thì một
        // khoản trả nợ thẻ rơi vào danh mục 'Chuyển tiền' sẽ ăn hết ngân sách
        // của danh mục đó, dù người dùng chưa tiêu thêm đồng nào.
        internalKind: null,
      },
      _sum: { amount: true },
    });

    const spent = new Map<string, number>();
    for (const row of rows) {
      if (row.categoryId && row._sum.amount !== null) {
        spent.set(row.categoryId, toMoney(row._sum.amount));
      }
    }
    return spent;
  }

  private async spentForCategory(
    userId: string,
    categoryId: string,
    from: string,
    to: string,
  ): Promise<number> {
    const result = await this.prisma.transaction.aggregate({
      where: {
        userId,
        categoryId,
        type: 'expense',
        date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
        internalKind: null,
      },
      _sum: { amount: true },
    });

    return result._sum.amount === null ? 0 : toMoney(result._sum.amount);
  }
}

function toBudgetDto(row: BudgetRow, spent: number): BudgetDto {
  const limitAmount = toMoney(row.limitAmount);

  return {
    id: row.id,
    month: row.month,
    limitAmount,
    spent,
    // Cố tình KHÔNG kẹp ở 0: người dùng cần biết đã vượt bao nhiêu, không chỉ
    // biết là "hết".
    remaining: limitAmount - spent,
    status: budgetStatusOf(spent, limitAmount),
    category: {
      id: row.category.id,
      name: row.category.name,
      type: row.category.type,
      icon: row.category.icon,
      color: row.category.color,
    },
  };
}

/** 'YYYY-MM' → biên ngày đầu/cuối tháng, dạng 'YYYY-MM-DD'. */
function monthBounds(month: string): { from: string; to: string } {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  const first = new Date(Date.UTC(year, monthIndex, 1));
  // Ngày 0 của tháng sau = ngày cuối tháng này. Tự viết "31" sẽ sai ở tháng 2.
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));

  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

/**
 * Tháng hiện tại theo giờ Việt Nam.
 *
 * Dùng ICT chứ không phải UTC: lúc 0h30 ngày 1/8 ở VN thì "tháng này" phải là
 * tháng 8, còn theo UTC vẫn là 31/7 — đúng kỹ thuật nhưng sai với đồng hồ của
 * người dùng.
 */
function currentMonthIct(): string {
  const nowIct = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const year = nowIct.getUTCFullYear();
  const month = String(nowIct.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
