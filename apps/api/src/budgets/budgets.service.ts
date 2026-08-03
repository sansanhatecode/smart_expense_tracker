import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  budgetStatusOf,
  numberToBigint,
  type BudgetAlertDto,
  type BudgetDto,
  type UpsertBudgetInput,
} from '@expense/shared';
import { toMoney } from '../common/mappers';
import { BudgetsRepository, type BudgetRow } from './budgets.repository';

@Injectable()
export class BudgetsService {
  constructor(private readonly budgets: BudgetsRepository) {}

  /** Ngân sách của một kỳ, kèm số đã chi tính từ DB. */
  async list(userId: string, month?: string): Promise<BudgetDto[]> {
    const period = month ?? currentMonthIct();
    const { from, to } = monthBounds(period);

    const [budgets, spentByCategory] = await Promise.all([
      this.budgets.findByMonth(userId, period),
      this.budgets.spentByCategory(userId, from, to),
    ]);

    return budgets.map((budget) => {
      const spent = spentByCategory.get(budget.category.id);
      return toBudgetDto(budget, spent === undefined ? 0 : toMoney(spent));
    });
  }

  /**
   * Tạo hoặc cập nhật ngân sách của (danh mục, kỳ).
   *
   * Là upsert chứ không phải create riêng và update riêng: từ góc nhìn người dùng,
   * "đặt ngân sách 3 triệu cho Ăn uống tháng 8" là một hành động, và họ không cần
   * biết là đã từng đặt hay chưa.
   */
  async upsert(userId: string, input: UpsertBudgetInput): Promise<BudgetDto> {
    const category = await this.budgets.findOwnedCategory(userId, input.categoryId);

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

    const budget = await this.budgets.upsert(userId, {
      categoryId: input.categoryId,
      month: input.month,
      limitAmount: numberToBigint(input.limitAmount),
    });

    const { from, to } = monthBounds(input.month);
    const spent = await this.budgets.spentForCategory(userId, input.categoryId, from, to);

    return toBudgetDto(budget, toMoney(spent));
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.budgets.findOwned(userId, id);

    if (!existing) {
      throw new NotFoundException('Không tìm thấy ngân sách');
    }

    await this.budgets.delete(id);
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
