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
  /**
   * Cần cho lúc sửa: `PATCH { type }` một mình cũng đổi chiều giao dịch, và
   * service phải biết danh mục đang giữ là gì mới kiểm được chiều sau khi patch.
   */
  categoryId: string | null;
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
      select: { id: true, type: true, categoryId: true },
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
   * Xoá nhiều giao dịch một lượt.
   *
   * `userId` trong where là thứ chặn việc xoá giao dịch của người khác bằng cách
   * nhồi id lạ vào danh sách — cùng lý do với `setCategoryMany`. Trả về số dòng
   * thật sự bị xoá, nên id không thuộc user chỉ đơn giản không được tính.
   */
  async deleteMany(userId: string, ids: string[]): Promise<number> {
    const result = await this.prisma.transaction.deleteMany({
      where: { id: { in: ids }, userId },
    });

    return result.count;
  }

  /**
   * Đếm trong danh sách có bao nhiêu giao dịch KHÁC chiều `type`.
   *
   * Dùng để chặn gán cả một lô vào danh mục lệch chiều. Đếm ở DB thay vì kéo cả
   * lô về app: danh sách có thể tới 500 id, mà câu trả lời cần chỉ là một số.
   */
  countMismatchedType(userId: string, ids: string[], type: TxType): Promise<number> {
    return this.prisma.transaction.count({
      where: { id: { in: ids }, userId, type: { not: type } },
    });
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

/**
 * Export để test được: đây là hàm thuần, và từ lúc danh mục / nguồn tiền / khoản
 * nội bộ nhận nhiều giá trị thì số tổ hợp của nó vượt xa mức đọc code mà chắc.
 * Không có chỗ nào ngoài repository này gọi nó.
 */
export function buildWhere(
  userId: string,
  query: TransactionQuery,
): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId };

  /*
   * Các điều kiện dạng OR đi vào đây rồi gắn một lần ở cuối.
   *
   * Không ghi thẳng `where.OR`: đã có ba nhóm OR độc lập (danh mục, nguồn tiền,
   * khoản nội bộ) cộng nhóm của `cashflow`, mà `where.OR` chỉ có MỘT chỗ — nhóm
   * sau sẽ ghi đè nhóm trước và cái filter bị đè im lặng không có tác dụng. Gộp
   * vào `AND` giữ đúng nghĩa "mỗi nhóm phải thoả".
   */
  const and: Prisma.TransactionWhereInput[] = [];

  if (query.from || query.to) {
    where.date = {
      ...(query.from ? { gte: fromDateOnly(query.from) } : {}),
      // `to` là bao gồm: lte đúng ngày đó, không phải lt.
      ...(query.to ? { lte: fromDateOnly(query.to) } : {}),
    };
  }

  /*
   * Danh mục: `uncategorized` cộng DỒN với danh sách id, không đè lên nó.
   *
   * Trước đây hai cái loại trừ nhau và `uncategorized` thắng. Với filter tick
   * nhiều thì "Ăn uống + Chưa phân loại" là một câu hỏi hợp lý, mà đè thì một
   * trong hai tick sẽ không có tác dụng gì và người dùng không hiểu tại sao.
   */
  const categoryIds = query.categoryId ?? [];

  if (query.uncategorized && categoryIds.length > 0) {
    and.push({ OR: [{ categoryId: null }, { categoryId: { in: categoryIds } }] });
  } else if (query.uncategorized) {
    where.categoryId = null;
  } else if (categoryIds.length > 0) {
    where.categoryId = { in: categoryIds };
  }

  if (query.type) {
    where.type = query.type;
  }

  // Nguồn tiền: cùng hình dạng với danh mục. `noAccount` là giao dịch nhập tay
  // không gắn nguồn — `IS NULL`, không phải một id, nên không nhét vào danh sách.
  const accountIds = query.accountId ?? [];

  if (query.noAccount && accountIds.length > 0) {
    and.push({ OR: [{ accountId: null }, { accountId: { in: accountIds } }] });
  } else if (query.noAccount) {
    where.accountId = null;
  } else if (accountIds.length > 0) {
    where.accountId = { in: accountIds };
  }

  /*
   * Khoản nội bộ. `none` = không phải khoản nội bộ (`IS NULL`), ba giá trị còn
   * lại là từng lý do một — nên tick được đúng "chỉ khoản trả nợ thẻ".
   *
   * `only`/`exclude` cũ đã được dịch về dạng này ở tầng schema, nên ở đây chỉ có
   * một vocabulary. Tick cả bốn thì điều kiện phủ mọi dòng — đúng nghĩa "không
   * lọc gì", không cần trường hợp riêng.
   */
  const internal = query.internal ?? [];

  if (internal.length > 0) {
    const kinds = internal.filter((value): value is InternalKind => value !== 'none');

    if (kinds.length > 0 && internal.includes('none')) {
      and.push({ OR: [{ internalKind: null }, { internalKind: { in: kinds } }] });
    } else if (kinds.length > 0) {
      where.internalKind = { in: kinds };
    } else {
      where.internalKind = null;
    }
  }

  /*
   * `cashflow=out`: tiền thật sự rời khỏi các nguồn có sẵn. Bỏ khoản quẹt thẻ
   * tín dụng (lúc đó tiền chưa đi đâu, chỉ là nợ) nhưng GIỮ khoản trả sao kê —
   * đó mới là lúc tiền đi. Phải khớp từng điều kiện với `sumCashOutflow` ở
   * stats.repository.ts, vì đây là danh sách đứng sau con số đó; hai bên lệch
   * nhau thì người dùng bấm vào và thấy tổng khác con số vừa đọc.
   *
   * Điều kiện đi vào `AND` chứ không ghi thẳng lên `where.internalKind`: giữ
   * như vậy thì `internal` của người dùng vẫn giao được với nó một cách có
   * nghĩa (chỉ khoản không nội bộ → chỉ khoản chi thường; chỉ trả nợ thẻ → chỉ
   * khoản trả sao kê) thay vì cái nọ âm thầm ghi đè cái kia. `type` thì bị đè,
   * vì "tiền đã ra" tự nó đã là một chiều tiền.
   */
  if (query.cashflow === 'out') {
    where.type = 'expense';
    and.push(
      { OR: [{ accountId: null }, { account: { kind: { not: 'credit_card' } } }] },
      { OR: [{ internalKind: null }, { internalKind: 'card_payment' }] },
    );
  }

  if (query.importBatchId) {
    where.importBatchId = query.importBatchId;
  }

  if (query.q) {
    where.description = { contains: query.q, mode: 'insensitive' };
  }

  if (and.length > 0) {
    where.AND = and;
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
