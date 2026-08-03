import { Injectable } from '@nestjs/common';
import type { TransactionQuery, TransactionSort } from '@expense/shared';
import { fromDateOnly } from '../common/mappers';
import { Prisma } from '../generated/prisma/client';
import type { InternalKind, TxType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const TRANSACTION_SELECT = {
  id: true,
  amount: true,
  type: true,
  date: true,
  description: true,
  balance: true,
  internalKind: true,
  importBatchId: true,
  createdAt: true,
  category: {
    select: { id: true, name: true, type: true, icon: true, color: true, sortOrder: true },
  },
  account: {
    select: { id: true, name: true, kind: true },
  },
} as const;

export type TransactionRow = Prisma.TransactionGetPayload<{ select: typeof TRANSACTION_SELECT }>;

/** Một giao dịch sẵn sàng ghi xuống DB: tiền đã là bigint, ngày còn là ngày lịch. */
export interface TransactionInsert {
  categoryId: string | null;
  accountId: string | null;
  amount: bigint;
  type: TxType;
  /** 'YYYY-MM-DD' */
  date: string;
  description: string;
  balance: bigint | null;
  internalKind: InternalKind | null;
  dedupeHash: string;
}

/** Các cột được phép sửa. `undefined` là "không đổi". */
export interface TransactionPatch {
  amount?: bigint;
  type?: TxType;
  /** 'YYYY-MM-DD' */
  date?: string;
  description?: string;
  categoryId?: string | null;
  accountId?: string | null;
  balance?: bigint | null;
  internalKind?: InternalKind | null;
}

export interface OwnedTransaction {
  id: string;
  type: TxType;
}

export interface OwnedCategory {
  id: string;
  type: TxType;
  name: string;
}

/** Mọi truy vấn DB của module giao dịch. */
@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Một trang giao dịch kèm tổng số dòng khớp filter.
   *
   * Chạy song song: count không phụ thuộc vào page nên không có lý do chờ tuần tự.
   */
  async findPage(
    userId: string,
    query: TransactionQuery,
  ): Promise<{ rows: TransactionRow[]; total: number }> {
    const where = buildWhere(userId, query);

    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        select: TRANSACTION_SELECT,
        orderBy: orderByOf(query.sort),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { rows, total };
  }

  create(userId: string, input: TransactionInsert): Promise<TransactionRow> {
    return this.prisma.transaction.create({
      data: {
        userId,
        categoryId: input.categoryId,
        accountId: input.accountId,
        amount: input.amount,
        type: input.type,
        date: fromDateOnly(input.date),
        description: input.description,
        balance: input.balance,
        internalKind: input.internalKind,
        dedupeHash: input.dedupeHash,
      },
      select: TRANSACTION_SELECT,
    });
  }

  update(id: string, patch: TransactionPatch): Promise<TransactionRow> {
    return this.prisma.transaction.update({
      where: { id },
      data: {
        ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.date !== undefined ? { date: fromDateOnly(patch.date) } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.accountId !== undefined ? { accountId: patch.accountId } : {}),
        ...(patch.balance !== undefined ? { balance: patch.balance } : {}),
        ...(patch.internalKind !== undefined ? { internalKind: patch.internalKind } : {}),
      },
      select: TRANSACTION_SELECT,
    });
  }

  findOwned(userId: string, id: string): Promise<OwnedTransaction | null> {
    return this.prisma.transaction.findFirst({
      where: { id, userId },
      select: { id: true, type: true },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.transaction.delete({ where: { id } });
  }

  /**
   * Gán danh mục cho nhiều giao dịch cùng lúc.
   *
   * `userId` trong where là thứ chặn việc sửa giao dịch của người khác bằng cách
   * nhồi id lạ vào danh sách.
   */
  async setCategoryMany(
    userId: string,
    ids: string[],
    categoryId: string | null,
  ): Promise<number> {
    const result = await this.prisma.transaction.updateMany({
      where: { id: { in: ids }, userId },
      data: { categoryId },
    });

    return result.count;
  }

  /**
   * Mô tả của các giao dịch cùng (ngày, số tiền, chiều tiền).
   *
   * Trả về mô tả GỐC chứ không đếm sẵn: khoá dedupe tính trên mô tả đã
   * normalize, mà DB không lưu cột đó — nên phần so khớp nằm ở service. Số dòng
   * trong một nhóm như vậy luôn rất nhỏ.
   */
  async findDescriptionsInGroup(
    userId: string,
    date: string,
    amount: bigint,
    type: TxType,
  ): Promise<string[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { userId, date: fromDateOnly(date), amount, type },
      select: { description: true },
    });

    return rows.map((row) => row.description);
  }

  findOwnedCategory(userId: string, categoryId: string): Promise<OwnedCategory | null> {
    return this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true, type: true, name: true },
    });
  }

  findOwnedAccount(userId: string, accountId: string): Promise<{ id: string } | null> {
    return this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
  }
}

function buildWhere(userId: string, query: TransactionQuery): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId };

  if (query.from || query.to) {
    where.date = {
      ...(query.from ? { gte: fromDateOnly(query.from) } : {}),
      // `to` là bao gồm: lte đúng ngày đó, không phải lt.
      ...(query.to ? { lte: fromDateOnly(query.to) } : {}),
    };
  }

  // `uncategorized` thắng `categoryId` khi cả hai được truyền — chúng loại trừ
  // nhau, và lọc "chưa phân loại" là ý định cụ thể hơn.
  if (query.uncategorized) {
    where.categoryId = null;
  } else if (query.categoryId) {
    where.categoryId = query.categoryId;
  }

  if (query.type) {
    where.type = query.type;
  }

  if (query.accountId) {
    where.accountId = query.accountId;
  }

  // `only` chính là màn hình "các khoản đã bị loại khỏi thống kê" — không cần
  // dựng route riêng cho nó.
  if (query.internal === 'only') {
    where.internalKind = { not: null };
  } else if (query.internal === 'exclude') {
    where.internalKind = null;
  }

  if (query.importBatchId) {
    where.importBatchId = query.importBatchId;
  }

  if (query.q) {
    where.description = { contains: query.q, mode: 'insensitive' };
  }

  return where;
}

function orderByOf(sort: TransactionSort): Prisma.TransactionOrderByWithRelationInput[] {
  switch (sort) {
    case 'date_asc':
      return [{ date: 'asc' }, { createdAt: 'asc' }];
    case 'amount_desc':
      return [{ amount: 'desc' }, { date: 'desc' }];
    case 'amount_asc':
      return [{ amount: 'asc' }, { date: 'desc' }];
    case 'date_desc':
    default:
      // createdAt là tiebreaker để thứ tự ổn định giữa các lần phân trang —
      // thiếu nó thì hai giao dịch cùng ngày có thể đổi chỗ và dòng bị lặp/mất
      // khi người dùng sang trang.
      return [{ date: 'desc' }, { createdAt: 'desc' }];
  }
}
