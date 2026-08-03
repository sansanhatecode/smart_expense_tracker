import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { numberToBigint, type AccountDto, type UpdateAccountInput } from '@expense/shared';
import { toMoney } from '../common/mappers';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ACCOUNT_SELECT = {
  id: true,
  name: true,
  kind: true,
  openingBalance: true,
  statementDay: true,
  dueDay: true,
  createdAt: true,
} as const;

type AccountRow = Prisma.AccountGetPayload<{ select: typeof ACCOUNT_SELECT }>;

/** Tổng chi và tổng thu của một nguồn tiền, tính trên TOÀN BỘ lịch sử. */
interface AccountTotals {
  expense: bigint;
  income: bigint;
  count: number;
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Danh sách nguồn tiền, kèm dư nợ với thẻ tín dụng.
   *
   * Tổng hợp bằng MỘT câu GROUP BY cho mọi account thay vì một query cho mỗi
   * thẻ: số nguồn tiền thì ít, nhưng đây là trang được mở thường xuyên và một
   * round-trip cho mỗi dòng là thứ không cần thiết ngay từ đầu.
   */
  async list(userId: string): Promise<AccountDto[]> {
    const [accounts, totals] = await Promise.all([
      this.prisma.account.findMany({
        where: { userId },
        select: ACCOUNT_SELECT,
        orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
      }),
      this.totalsByAccount(userId),
    ]);

    return accounts.map((account) => toAccountDto(account, totals.get(account.id)));
  }

  async update(userId: string, id: string, input: UpdateAccountInput): Promise<AccountDto> {
    await this.assertOwned(userId, id);

    const account = await this.prisma.account.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.openingBalance === undefined
          ? {}
          : { openingBalance: numberToBigint(input.openingBalance) }),
        // `null` là giá trị hợp lệ (xoá ngày chốt), nên phải phân biệt với
        // "không gửi lên" bằng `undefined` chứ không bằng falsy.
        ...(input.statementDay === undefined ? {} : { statementDay: input.statementDay }),
        ...(input.dueDay === undefined ? {} : { dueDay: input.dueDay }),
      },
      select: ACCOUNT_SELECT,
    });

    const totals = await this.totalsByAccount(userId, id);

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

    const used = await this.prisma.transaction.count({ where: { userId, accountId: id } });

    if (used > 0) {
      throw new ConflictException(
        `Nguồn tiền này đang gắn với ${used} giao dịch. Xoá các giao dịch đó trước, ` +
          'hoặc đổi tên nguồn tiền nếu chỉ muốn gọi nó bằng tên khác.',
      );
    }

    await this.prisma.account.delete({ where: { id } });
  }

  private async assertOwned(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.account.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy nguồn tiền');
    }
  }

  /**
   * Cộng dồn theo (account, chiều tiền) trên TOÀN BỘ lịch sử, không giới hạn kỳ.
   *
   * Dư nợ thẻ là một số dư tích luỹ, không phải một con số của tháng: giới hạn
   * theo kỳ sẽ cho ra "dư nợ" bằng đúng phát sinh trong kỳ, tức sai.
   *
   * Khoản nội bộ KHÔNG bị loại ở đây, khác với mọi query thống kê. Đó chính là
   * điểm mấu chốt: khoản thanh toán sao kê là thứ duy nhất làm dư nợ giảm.
   */
  private async totalsByAccount(
    userId: string,
    accountId?: string,
  ): Promise<Map<string, AccountTotals>> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: {
        userId,
        accountId: accountId === undefined ? { not: null } : accountId,
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const totals = new Map<string, AccountTotals>();

    for (const row of rows) {
      if (row.accountId === null) continue;

      const current = totals.get(row.accountId) ?? { expense: 0n, income: 0n, count: 0 };
      const amount = row._sum.amount ?? 0n;

      totals.set(row.accountId, {
        expense: row.type === 'expense' ? current.expense + amount : current.expense,
        income: row.type === 'income' ? current.income + amount : current.income,
        count: current.count + row._count._all,
      });
    }

    return totals;
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
