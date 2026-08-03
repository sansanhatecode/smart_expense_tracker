import { Injectable } from '@nestjs/common';
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

export type AccountRow = Prisma.AccountGetPayload<{ select: typeof ACCOUNT_SELECT }>;

/** Tổng chi và tổng thu của một nguồn tiền, tính trên TOÀN BỘ lịch sử. */
export interface AccountTotals {
  expense: bigint;
  income: bigint;
  count: number;
}

/** Các cột được phép sửa. `null` là giá trị hợp lệ, `undefined` là "không đổi". */
export interface AccountPatch {
  name?: string;
  openingBalance?: bigint;
  statementDay?: number | null;
  dueDay?: number | null;
}

/** Mọi truy vấn DB của module nguồn tiền. */
@Injectable()
export class AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string): Promise<AccountRow[]> {
    return this.prisma.account.findMany({
      where: { userId },
      select: ACCOUNT_SELECT,
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findOwned(userId: string, id: string): Promise<{ id: string } | null> {
    return this.prisma.account.findFirst({
      where: { id, userId },
      select: { id: true },
    });
  }

  update(id: string, patch: AccountPatch): Promise<AccountRow> {
    return this.prisma.account.update({
      where: { id },
      data: {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.openingBalance === undefined
          ? {}
          : { openingBalance: patch.openingBalance }),
        // `null` là giá trị hợp lệ (xoá ngày chốt), nên phải phân biệt với
        // "không gửi lên" bằng `undefined` chứ không bằng falsy.
        ...(patch.statementDay === undefined ? {} : { statementDay: patch.statementDay }),
        ...(patch.dueDay === undefined ? {} : { dueDay: patch.dueDay }),
      },
      select: ACCOUNT_SELECT,
    });
  }

  countTransactions(userId: string, accountId: string): Promise<number> {
    return this.prisma.transaction.count({ where: { userId, accountId } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.account.delete({ where: { id } });
  }

  /**
   * Cộng dồn theo (account, chiều tiền) trên TOÀN BỘ lịch sử, không giới hạn kỳ.
   *
   * Dư nợ thẻ là một số dư tích luỹ, không phải một con số của tháng: giới hạn
   * theo kỳ sẽ cho ra "dư nợ" bằng đúng phát sinh trong kỳ, tức sai.
   *
   * Khoản nội bộ KHÔNG bị loại ở đây, khác với mọi query thống kê. Đó chính là
   * điểm mấu chốt: khoản thanh toán sao kê là thứ duy nhất làm dư nợ giảm.
   *
   * Một câu GROUP BY cho mọi account thay vì một query cho mỗi thẻ: số nguồn
   * tiền thì ít, nhưng đây là trang được mở thường xuyên và một round-trip cho
   * mỗi dòng là thứ không cần thiết ngay từ đầu.
   */
  async totalsByAccount(
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
