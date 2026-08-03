import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { numberToBigint, type AccountDto, type UpdateAccountInput } from '@expense/shared';
import { toMoney } from '../common/mappers';
import {
  AccountsRepository,
  type AccountPatch,
  type AccountRow,
  type AccountTotals,
} from './accounts.repository';

@Injectable()
export class AccountsService {
  constructor(private readonly accounts: AccountsRepository) {}

  /** Danh sách nguồn tiền, kèm dư nợ với thẻ tín dụng. */
  async list(userId: string): Promise<AccountDto[]> {
    const [accounts, totals] = await Promise.all([
      this.accounts.findAll(userId),
      this.accounts.totalsByAccount(userId),
    ]);

    return accounts.map((account) => toAccountDto(account, totals.get(account.id)));
  }

  async update(userId: string, id: string, input: UpdateAccountInput): Promise<AccountDto> {
    await this.assertOwned(userId, id);

    const patch: AccountPatch = {
      name: input.name,
      ...(input.openingBalance === undefined
        ? {}
        : { openingBalance: numberToBigint(input.openingBalance) }),
      statementDay: input.statementDay,
      dueDay: input.dueDay,
    };

    const account = await this.accounts.update(id, patch);
    const totals = await this.accounts.totalsByAccount(userId, id);

    return toAccountDto(account, totals.get(account.id));
  }

  /**
   * Xoá nguồn tiền — chỉ khi nó chưa có giao dịch nào.
   *
   * FK là `onDelete: SetNull`, nên xoá một account đang dùng sẽ âm thầm biến
   * mọi giao dịch của nó thành "không rõ nguồn". Người dùng không thấy điều đó
   * xảy ra và cũng không hoàn lại được, nên chặn ở đây và nói rõ số lượng.
   */
  async remove(userId: string, id: string): Promise<void> {
    await this.assertOwned(userId, id);

    const used = await this.accounts.countTransactions(userId, id);

    if (used > 0) {
      throw new ConflictException(
        `Nguồn tiền này đang gắn với ${used} giao dịch. Xoá các giao dịch đó trước, ` +
          'hoặc đổi tên nguồn tiền nếu chỉ muốn gọi nó bằng tên khác.',
      );
    }

    await this.accounts.delete(id);
  }

  private async assertOwned(userId: string, id: string): Promise<void> {
    const existing = await this.accounts.findOwned(userId, id);

    if (!existing) {
      throw new NotFoundException('Không tìm thấy nguồn tiền');
    }
  }
}

function toAccountDto(row: AccountRow, totals: AccountTotals | undefined): AccountDto {
  const sums = totals ?? { expense: 0n, income: 0n, count: 0 };

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    openingBalance: toMoney(row.openingBalance),
    statementDay: row.statementDay,
    dueDay: row.dueDay,
    transactionCount: sums.count,
    outstanding:
      row.kind === 'credit_card'
        ? toMoney(row.openingBalance + sums.expense - sums.income)
        : null,
    currentPeriod: currentPeriodOf(row.statementDay, row.dueDay),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Kỳ sao kê đang chạy, suy từ ngày chốt.
 *
 * Kỳ chạy từ ngày sau ngày chốt trước đó tới đúng ngày chốt sắp tới. Ví dụ chốt
 * ngày 5, hôm nay 3/8 → kỳ là 06/07 đến 05/08.
 *
 * `today` mặc định là bây giờ theo giờ Việt Nam — cùng lý do với
 * `currentMonthIct` trong budgets: lúc 0h30 ngày 6/8 ở VN thì kỳ mới đã bắt
 * đầu, còn theo UTC vẫn là 5/8. Tham số hoá để test được các mốc chuyển tháng
 * mà không phải giả lập đồng hồ.
 */
export function currentPeriodOf(
  statementDay: number | null,
  dueDay: number | null,
  today: Date = new Date(Date.now() + 7 * 60 * 60 * 1000),
): AccountDto['currentPeriod'] {
  if (statementDay === null) return null;

  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();

  // Đã qua ngày chốt của tháng này thì kỳ hiện tại kết thúc ở tháng sau.
  const closeMonth = day > clampDay(statementDay, year, month) ? month + 1 : month;

  const close = dayInMonth(year, closeMonth, statementDay);
  const previousClose = dayInMonth(year, closeMonth - 1, statementDay);

  const from = new Date(previousClose);
  from.setUTCDate(from.getUTCDate() + 1);

  return {
    from: from.toISOString().slice(0, 10),
    to: close.toISOString().slice(0, 10),
    // Ngày đến hạn nằm sau ngày chốt; nếu số ngày nhỏ hơn thì nó thuộc tháng kế.
    dueDate:
      dueDay === null
        ? null
        : dayInMonth(year, dueDay > statementDay ? closeMonth : closeMonth + 1, dueDay)
            .toISOString()
            .slice(0, 10),
  };
}

/** Ngày `day` của tháng, kẹp về ngày cuối tháng khi tháng đó ngắn hơn. */
function dayInMonth(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, clampDay(day, year, monthIndex)));
}

function clampDay(day: number, year: number, monthIndex: number): number {
  // Ngày 0 của tháng sau = ngày cuối tháng này. Người dùng khai ngày chốt 31 thì
  // tháng 2 phải hiểu là 28/29, chứ không phải tràn sang tháng 3.
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.min(day, lastDay);
}
