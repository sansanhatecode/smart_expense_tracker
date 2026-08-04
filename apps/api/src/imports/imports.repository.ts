import { Injectable } from '@nestjs/common';
import { fromDateOnly } from '../common/mappers';
import { Prisma } from '../generated/prisma/client';
import type {
  AccountKind,
  DuplicateKind,
  ImportSource,
  ImportStatus,
  InternalKind,
  TxType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const STAGED_SELECT = {
  id: true,
  rowIndex: true,
  amount: true,
  type: true,
  date: true,
  description: true,
  balance: true,
  duplicate: true,
  selected: true,
  rawLine: true,
  category: {
    select: { id: true, name: true, type: true, icon: true, color: true, sortOrder: true },
  },
} as const;

const BATCH_SELECT = {
  id: true,
  fileName: true,
  source: true,
  bankProfile: true,
  status: true,
  createdAt: true,
  account: { select: { id: true, name: true, kind: true } },
  staged: { select: STAGED_SELECT, orderBy: { rowIndex: 'asc' } },
} as const;

const BATCH_LIST_SELECT = {
  id: true,
  fileName: true,
  source: true,
  bankProfile: true,
  status: true,
  rowCount: true,
  createdAt: true,
  confirmedAt: true,
  _count: { select: { transactions: true } },
} as const;

export type StagedRow = Prisma.StagedTransactionGetPayload<{ select: typeof STAGED_SELECT }>;

export type BatchWithStagedRow = Prisma.ImportBatchGetPayload<{ select: typeof BATCH_SELECT }>;

export type BatchListRow = Prisma.ImportBatchGetPayload<{ select: typeof BATCH_LIST_SELECT }>;

/** Rule auto-categorize đọc từ DB, phẳng hoá phần `category.type`. */
export interface RuleRow {
  keyword: string;
  categoryId: string;
  categoryType: TxType;
  priority: number;
}

/** Một dòng staging đã sẵn sàng ghi: danh mục và cờ trùng đã được quyết ở service. */
export interface StagedInsert {
  rowIndex: number;
  categoryId: string | null;
  amount: bigint;
  type: TxType;
  /** 'YYYY-MM-DD' */
  date: string;
  description: string;
  balance: bigint | null;
  dedupeHash: string;
  internalKind: InternalKind | null;
  duplicate: DuplicateKind;
  selected: boolean;
  rawLine: string;
}

export interface CreateBatchInput {
  userId: string;
  source: ImportSource;
  fileName: string;
  bankProfile: string;
  /** Nguồn tiền suy ra từ file; upsert theo fingerprint. */
  account: { fingerprint: string; name: string; kind: AccountKind };
  rows: StagedInsert[];
}

export interface StagedPatch {
  categoryId?: string | null;
  selected?: boolean;
}

/** Mọi truy vấn DB của module import. */
@Injectable()
export class ImportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tạo batch: upsert nguồn tiền, tạo batch, ghi toàn bộ dòng staging.
   *
   * Nằm trong một DB transaction: một batch tồn tại mà không có dòng nào, hoặc
   * dòng staging trỏ vào batch chưa kịp tạo, đều là trạng thái không dùng được.
   */
  createBatch(input: CreateBatchInput): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      // upsert chứ không create: import cùng ngân hàng tháng sau phải rơi vào
      // đúng account cũ. `update: {}` để không ghi đè tên người dùng đã sửa.
      const account = await tx.account.upsert({
        where: {
          userId_fingerprint: {
            userId: input.userId,
            fingerprint: input.account.fingerprint,
          },
        },
        create: {
          userId: input.userId,
          fingerprint: input.account.fingerprint,
          name: input.account.name,
          kind: input.account.kind,
        },
        update: {},
        select: { id: true },
      });

      const created = await tx.importBatch.create({
        data: {
          userId: input.userId,
          source: input.source,
          fileName: input.fileName,
          bankProfile: input.bankProfile,
          accountId: account.id,
          rowCount: input.rows.length,
          status: 'pending',
        },
        select: { id: true },
      });

      await tx.stagedTransaction.createMany({
        data: input.rows.map((row) => ({
          batchId: created.id,
          rowIndex: row.rowIndex,
          categoryId: row.categoryId,
          accountId: account.id,
          amount: row.amount,
          type: row.type,
          date: fromDateOnly(row.date),
          description: row.description,
          balance: row.balance,
          dedupeHash: row.dedupeHash,
          internalKind: row.internalKind,
          duplicate: row.duplicate,
          selected: row.selected,
          rawLine: row.rawLine,
        })),
      });

      return created;
    });
  }

  findBatchWithStaged(userId: string, batchId: string): Promise<BatchWithStagedRow | null> {
    return this.prisma.importBatch.findFirst({
      where: { id: batchId, userId },
      select: BATCH_SELECT,
    });
  }

  findBatches(userId: string): Promise<BatchListRow[]> {
    return this.prisma.importBatch.findMany({
      where: { userId },
      select: BATCH_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  findOwnedBatch(
    userId: string,
    batchId: string,
  ): Promise<{ id: string; status: ImportStatus } | null> {
    return this.prisma.importBatch.findFirst({
      where: { id: batchId, userId },
      select: { id: true, status: true },
    });
  }

  async deleteBatch(batchId: string): Promise<void> {
    await this.prisma.importBatch.delete({ where: { id: batchId } });
  }

  /** Trả kèm `type`: service cần chiều tiền của dòng để kiểm danh mục được gán. */
  findStagedRow(
    batchId: string,
    rowId: string,
  ): Promise<{ id: string; type: TxType } | null> {
    return this.prisma.stagedTransaction.findFirst({
      where: { id: rowId, batchId },
      select: { id: true, type: true },
    });
  }

  /**
   * Đếm trong danh sách có bao nhiêu dòng staging KHÁC chiều `type`.
   *
   * Bản sao của `countMismatchedType` ở transactions.repository, cho bước preview.
   * Đếm ở DB thay vì kéo cả lô về: danh sách có thể tới 1000 id, mà câu trả lời
   * cần chỉ là một số.
   */
  countMismatchedType(batchId: string, rowIds: string[], type: TxType): Promise<number> {
    return this.prisma.stagedTransaction.count({
      where: { id: { in: rowIds }, batchId, type: { not: type } },
    });
  }

  updateStagedRow(rowId: string, patch: StagedPatch): Promise<StagedRow> {
    return this.prisma.stagedTransaction.update({
      where: { id: rowId },
      data: {
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.selected !== undefined ? { selected: patch.selected } : {}),
      },
      select: STAGED_SELECT,
    });
  }

  /**
   * Sửa nhiều dòng staging cùng lúc.
   *
   * `batchId` trong where là thứ chặn việc sửa dòng của batch khác bằng cách
   * nhồi id lạ vào danh sách.
   */
  async updateStagedRows(
    batchId: string,
    rowIds: string[],
    patch: StagedPatch,
  ): Promise<number> {
    const result = await this.prisma.stagedTransaction.updateMany({
      where: { id: { in: rowIds }, batchId },
      data: {
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.selected !== undefined ? { selected: patch.selected } : {}),
      },
    });

    return result.count;
  }

  /**
   * Commit batch: copy dòng đã tick sang `Transaction`.
   *
   * Toàn bộ nằm trong một DB transaction. Nếu tách ra, một lần crash giữa đường
   * để lại batch vừa có giao dịch vừa còn staged — không rollback được mà cũng
   * không confirm lại được.
   */
  confirmBatch(
    userId: string,
    batchId: string,
  ): Promise<{ inserted: number; staged: number }> {
    return this.prisma.$transaction(async (tx) => {
      const staged = await tx.stagedTransaction.findMany({
        where: { batchId },
        select: {
          rowIndex: true,
          categoryId: true,
          accountId: true,
          amount: true,
          type: true,
          date: true,
          description: true,
          balance: true,
          dedupeHash: true,
          internalKind: true,
          selected: true,
        },
        orderBy: { rowIndex: 'asc' },
      });

      const toInsert = staged.filter((row) => row.selected);

      const inserted = await tx.transaction.createMany({
        data: toInsert.map((row) => ({
          userId,
          categoryId: row.categoryId,
          accountId: row.accountId,
          amount: row.amount,
          type: row.type,
          date: row.date,
          description: row.description,
          balance: row.balance,
          dedupeHash: row.dedupeHash,
          internalKind: row.internalKind,
          importBatchId: batchId,
        })),
        // Chặn race: nếu cùng lúc có batch khác confirm dòng trùng hash thì bỏ
        // qua thay vì làm cả lần confirm thất bại.
        skipDuplicates: true,
      });

      await tx.importBatch.update({
        where: { id: batchId },
        data: { status: 'confirmed', confirmedAt: new Date() },
      });

      // Xoá staged sau khi copy: giữ lại chỉ làm dữ liệu tồn tại hai nơi, và
      // rollback đã có `importBatchId` để tìm lại giao dịch.
      await tx.stagedTransaction.deleteMany({ where: { batchId } });

      return { inserted: inserted.count, staged: staged.length };
    });
  }

  /**
   * Xoá giao dịch của một batch đã confirm và đánh dấu batch là rolled_back.
   *
   * Hai việc trong một transaction: batch báo rolled_back trong khi giao dịch
   * vẫn còn là trạng thái người dùng không có cách nào sửa.
   */
  rollbackConfirmedBatch(userId: string, batchId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.transaction.deleteMany({
        where: { importBatchId: batchId, userId },
      });

      await tx.importBatch.update({
        where: { id: batchId },
        data: { status: 'rolled_back' },
      });

      return deleted.count;
    });
  }

  /**
   * Tìm những hash đã có trong DB.
   *
   * Chia lô để câu `IN (...)` không phình quá lớn với file 10.000 dòng — Postgres
   * xử lý được, nhưng driver và log thì bắt đầu khó chịu.
   */
  async findExistingHashes(userId: string, hashes: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    const CHUNK = 1_000;

    for (let i = 0; i < hashes.length; i += CHUNK) {
      const chunk = hashes.slice(i, i + CHUNK);
      const rows = await this.prisma.transaction.findMany({
        where: { userId, dedupeHash: { in: chunk } },
        select: { dedupeHash: true },
      });
      for (const row of rows) found.add(row.dedupeHash);
    }

    return found;
  }

  async findRules(userId: string): Promise<RuleRow[]> {
    const rows = await this.prisma.categoryRule.findMany({
      where: { userId },
      select: {
        keyword: true,
        categoryId: true,
        priority: true,
        category: { select: { type: true } },
      },
    });

    return rows.map((row) => ({
      keyword: row.keyword,
      categoryId: row.categoryId,
      categoryType: row.category.type,
      priority: row.priority,
    }));
  }

  findCategories(
    userId: string,
  ): Promise<Array<{ id: string; name: string; type: TxType }>> {
    return this.prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true, type: true },
    });
  }

  /** Trả kèm `type`/`name`: service cần cả hai để kiểm chiều và viết message cụ thể. */
  findOwnedCategory(
    userId: string,
    categoryId: string,
  ): Promise<{ id: string; type: TxType; name: string } | null> {
    return this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true, type: true, name: true },
    });
  }

  /** Xoá batch pending tạo trước mốc `before`. Trả về số batch đã xoá. */
  async deleteStalePendingBatches(userId: string, before: Date): Promise<number> {
    const result = await this.prisma.importBatch.deleteMany({
      where: {
        userId,
        status: 'pending',
        createdAt: { lt: before },
      },
    });

    return result.count;
  }
}
