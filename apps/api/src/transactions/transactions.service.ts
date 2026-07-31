import { Injectable, NotFoundException } from '@nestjs/common';
import {
  numberToBigint,
  type BulkCategorizeInput,
  type CreateTransactionInput,
  type Paginated,
  type TransactionDto,
  type TransactionQuery,
  type TransactionSort,
  type UpdateTransactionInput,
} from '@expense/shared';
import { toCategorySummary, toDateOnly, toMoney, toNullableMoney } from '../common/mappers';
import { computeDedupeHash, dedupeGroupKey, normalizeDescription } from '../imports/dedupe';
import { Prisma } from '../generated/prisma/client';
import type { TxType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const TRANSACTION_SELECT = {
  id: true,
  amount: true,
  type: true,
  date: true,
  description: true,
  balance: true,
  importBatchId: true,
  createdAt: true,
  category: {
    select: { id: true, name: true, type: true, icon: true, color: true, sortOrder: true },
  },
} as const;

type TransactionRow = Prisma.TransactionGetPayload<{ select: typeof TRANSACTION_SELECT }>;

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: TransactionQuery): Promise<Paginated<TransactionDto>> {
    const where = this.buildWhere(userId, query);

    // Chạy song song: count không phụ thuộc vào page nên không có lý do chờ tuần tự.
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

    return {
      items: rows.map(toTransactionDto),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async create(userId: string, input: CreateTransactionInput): Promise<TransactionDto> {
    if (input.categoryId) {
      await this.assertOwnsCategory(userId, input.categoryId, input.type);
    }

    const amount = numberToBigint(input.amount);
    const normalizedDescription = normalizeDescription(input.description);

    /**
     * Giao dịch nhập tay cũng cần dedupeHash, và nó phải nằm cùng không gian hash
     * với dòng import — nếu không thì nhập tay một giao dịch rồi import sao kê
     * chứa đúng giao dịch đó sẽ ra hai bản.
     *
     * `seq` ở đây = số giao dịch ĐÃ CÓ cùng khoá, tức bản này là bản thứ (n+1).
     * Xem chú thích ở src/imports/dedupe.ts.
     */
    const seq = await this.countSameGroup(
      userId,
      input.date,
      amount,
      input.type,
      normalizedDescription,
    );

    const row = await this.prisma.transaction.create({
      data: {
        userId,
        categoryId: input.categoryId,
        amount,
        type: input.type,
        date: new Date(`${input.date}T00:00:00.000Z`),
        description: input.description,
        balance: input.balance === null ? null : numberToBigint(input.balance),
        dedupeHash: computeDedupeHash({
          userId,
          date: input.date,
          amount,
          type: input.type,
          normalizedDescription,
          seq,
        }),
      },
      select: TRANSACTION_SELECT,
    });

    return toTransactionDto(row);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateTransactionInput,
  ): Promise<TransactionDto> {
    const existing = await this.prisma.transaction.findFirst({
      where: { id, userId },
      select: { id: true, type: true },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    if (input.categoryId) {
      await this.assertOwnsCategory(userId, input.categoryId, input.type ?? existing.type);
    }

    /**
     * Cố tình KHÔNG tính lại dedupeHash khi sửa.
     *
     * Hash tồn tại để nhận ra "dòng này đã import rồi", nên nó phải phản ánh dữ
     * liệu GỐC từ file. Nếu người dùng sửa mô tả rồi hash đổi theo, thì import
     * lại đúng file đó sẽ không còn nhận ra trùng và sinh thêm một bản.
     */
    const row = await this.prisma.transaction.update({
      where: { id },
      data: {
        ...(input.amount !== undefined ? { amount: numberToBigint(input.amount) } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.date !== undefined
          ? { date: new Date(`${input.date}T00:00:00.000Z`) }
          : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.balance !== undefined
          ? { balance: input.balance === null ? null : numberToBigint(input.balance) }
          : {}),
      },
      select: TRANSACTION_SELECT,
    });

    return toTransactionDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.transaction.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    await this.prisma.transaction.delete({ where: { id } });
  }

  /**
   * Gán danh mục cho nhiều giao dịch cùng lúc.
   *
   * Là thao tác đáng có riêng vì sau mỗi lần import sẽ còn một loạt giao dịch
   * chưa phân loại, và bắt người dùng sửa từng dòng là lý do họ bỏ dùng app.
   */
  async bulkCategorize(userId: string, input: BulkCategorizeInput): Promise<{ updated: number }> {
    if (input.categoryId) {
      await this.assertOwnsCategory(userId, input.categoryId);
    }

    // `userId` trong where là thứ chặn việc sửa giao dịch của người khác bằng
    // cách nhồi id lạ vào danh sách.
    const result = await this.prisma.transaction.updateMany({
      where: { id: { in: input.transactionIds }, userId },
      data: { categoryId: input.categoryId },
    });

    return { updated: result.count };
  }

  private buildWhere(userId: string, query: TransactionQuery): Prisma.TransactionWhereInput {
    const where: Prisma.TransactionWhereInput = { userId };

    if (query.from || query.to) {
      where.date = {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        // `to` là bao gồm: lte đúng ngày đó, không phải lt.
        ...(query.to ? { lte: new Date(`${query.to}T00:00:00.000Z`) } : {}),
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

    if (query.importBatchId) {
      where.importBatchId = query.importBatchId;
    }

    if (query.q) {
      where.description = { contains: query.q, mode: 'insensitive' };
    }

    return where;
  }

  /**
   * Đếm số giao dịch đã có cùng khoá dedupe, kể cả phần mô tả đã normalize.
   *
   * Phải đọc mô tả ra rồi normalize trong app: DB không lưu cột normalized, và
   * thêm cột đó chỉ để phục vụ việc này thì không đáng — số dòng trong một nhóm
   * (cùng ngày, cùng số tiền, cùng chiều) luôn rất nhỏ.
   */
  private async countSameGroup(
    userId: string,
    date: string,
    amount: bigint,
    type: TxType,
    normalizedDescription: string,
  ): Promise<number> {
    const candidates = await this.prisma.transaction.findMany({
      where: { userId, date: new Date(`${date}T00:00:00.000Z`), amount, type },
      select: { description: true },
    });

    const target = dedupeGroupKey({ date, amount, type, normalizedDescription });

    return candidates.filter(
      (candidate) =>
        dedupeGroupKey({
          date,
          amount,
          type,
          normalizedDescription: normalizeDescription(candidate.description),
        }) === target,
    ).length;
  }

  /**
   * Danh mục phải thuộc user, và chiều thu/chi phải khớp với giao dịch.
   *
   * Kiểm tra chiều là để không xảy ra chuyện gán giao dịch chi vào danh mục thu:
   * thống kê theo danh mục sẽ ra số vô nghĩa mà không có gì báo lỗi.
   */
  private async assertOwnsCategory(
    userId: string,
    categoryId: string,
    type?: TxType,
  ): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true, type: true, name: true },
    });

    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }

    if (type && category.type !== type) {
      throw new NotFoundException(
        `Danh mục "${category.name}" là danh mục ${category.type === 'income' ? 'thu' : 'chi'}, ` +
          `không dùng được cho giao dịch ${type === 'income' ? 'thu' : 'chi'}`,
      );
    }
  }
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

function toTransactionDto(row: TransactionRow): TransactionDto {
  return {
    id: row.id,
    amount: toMoney(row.amount),
    type: row.type,
    date: toDateOnly(row.date),
    description: row.description,
    balance: toNullableMoney(row.balance),
    category: toCategorySummary(row.category),
    importBatchId: row.importBatchId,
    createdAt: row.createdAt.toISOString(),
  };
}
