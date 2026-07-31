import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type {
  BulkUpdateStagedInput,
  ConfirmImportResultDto,
  ImportBatchDto,
  ImportCountsDto,
  ImportPreviewDto,
  SkippedRowDto,
  StagedRowDto,
  UpdateStagedRowInput,
} from '@expense/shared';
import { AUTO_DETECT_CANDIDATES, findProfile } from './bank-profiles';
import { categorize, type CategorizerRule } from './categorizer';
import { assignSequences, computeDedupeHash } from './dedupe';
import { detectFormat, explainUnsupported } from './detect-format';
import { normalize } from './normalizer';
import { CsvParser } from './parsers/csv.parser';
import { XlsxParser } from './parsers/xlsx.parser';
import type { BankProfile, NormalizedTransaction, SkippedRow, StatementParser, UploadedFile } from './types';
import { toCategorySummary, toDateOnly, toMoney, toNullableMoney } from '../common/mappers';
import { env } from '../config/env';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Batch pending cũ hơn mốc này bị dọn — người dùng đã bỏ giữa đường. */
const PENDING_BATCH_TTL_MS = 24 * 60 * 60 * 1000;

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

type StagedRow = Prisma.StagedTransactionGetPayload<{ select: typeof STAGED_SELECT }>;

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);
  private readonly parsers: StatementParser[] = [new CsvParser(), new XlsxParser()];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upload → parse → normalize → categorize → dedupe → ghi vào bảng staging.
   *
   * KHÔNG ghi vào `Transaction`. Preview state phải bền vì request confirm là một
   * request HTTP khác; và giữ nó ngoài `Transaction` nghĩa là không query thống kê
   * nào cần nhớ filter theo status. Xem ADR 9.6.
   */
  async createBatch(
    userId: string,
    file: UploadedFile,
    bankProfileId?: string,
  ): Promise<ImportPreviewDto> {
    this.assertFileAcceptable(file);

    const parser = this.pickParser(file);

    const { result, profile } = await this.parseWithProfile(parser, file, bankProfileId);

    if (result.rows.length === 0) {
      // Nói rõ vì sao không có dòng nào, thay vì trả về một batch rỗng bí ẩn.
      const reason = result.skipped[0]?.reason ?? 'File không có dòng giao dịch nào đọc được';
      throw new BadRequestException(reason);
    }

    if (result.rows.length > env.MAX_IMPORT_ROWS) {
      throw new PayloadTooLargeException(
        `File có ${result.rows.length} dòng, vượt giới hạn ${env.MAX_IMPORT_ROWS} dòng mỗi lần import.`,
      );
    }

    const { rows: normalized, skipped: normalizeSkipped } = normalize(result.rows, profile);
    const skipped = [...result.skipped, ...normalizeSkipped];

    // seq tính TRONG BATCH, không cộng số dòng đã có trong DB — cộng vào thì
    // import lại cùng file sẽ ra hash khác và dedupe mất tác dụng. Xem ADR 9.8.
    const withSeq = assignSequences(normalized);

    const hashed = withSeq.map((row) => ({
      ...row,
      dedupeHash: computeDedupeHash({
        userId,
        date: row.date,
        amount: row.amount,
        type: row.type,
        normalizedDescription: row.normalizedDescription,
        seq: row.seq,
      }),
    }));

    const [existingHashes, rules] = await Promise.all([
      this.findExistingHashes(
        userId,
        hashed.map((row) => row.dedupeHash),
      ),
      this.loadRules(userId),
    ]);

    void this.cleanupStalePendingBatches(userId);

    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.importBatch.create({
        data: {
          userId,
          source: parser.source,
          fileName: file.originalName,
          bankProfile: profile.id,
          rowCount: hashed.length,
          status: 'pending',
        },
        select: { id: true, createdAt: true },
      });

      await tx.stagedTransaction.createMany({
        data: hashed.map((row) => {
          const isDuplicate = existingHashes.has(row.dedupeHash);
          return {
            batchId: created.id,
            rowIndex: row.rowIndex,
            categoryId: categorize(row, rules),
            amount: row.amount,
            type: row.type,
            date: new Date(`${row.date}T00:00:00.000Z`),
            description: row.description,
            balance: row.balance,
            dedupeHash: row.dedupeHash,
            duplicate: isDuplicate ? ('in_db' as const) : ('none' as const),
            // Dòng trùng mặc định BỎ TICK: mặc định an toàn là không thêm lại thứ
            // đã có. Người dùng vẫn tick lại được nếu biết mình đang làm gì.
            selected: !isDuplicate,
            rawLine: row.raw,
          };
        }),
      });

      return created;
    });

    return this.buildPreview(userId, batch.id, skipped);
  }

  async getPreview(userId: string, batchId: string): Promise<ImportPreviewDto> {
    // Dòng bị skip chỉ tồn tại lúc parse, không lưu DB — nên lần đọc lại sau này
    // không còn. Đó là đánh đổi có ý thức: lưu chúng chỉ để hiển thị lại thì
    // thêm một bảng cho dữ liệu dùng một lần.
    return this.buildPreview(userId, batchId, []);
  }

  async listBatches(userId: string): Promise<ImportBatchDto[]> {
    const rows = await this.prisma.importBatch.findMany({
      where: { userId },
      select: {
        id: true,
        fileName: true,
        source: true,
        bankProfile: true,
        status: true,
        rowCount: true,
        createdAt: true,
        confirmedAt: true,
        _count: { select: { transactions: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return rows.map((row) => ({
      id: row.id,
      fileName: row.fileName,
      source: row.source,
      bankProfile: row.bankProfile,
      status: row.status,
      rowCount: row.rowCount,
      transactionCount: row._count.transactions,
      createdAt: row.createdAt.toISOString(),
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
    }));
  }

  async updateRow(
    userId: string,
    batchId: string,
    rowId: string,
    input: UpdateStagedRowInput,
  ): Promise<StagedRowDto> {
    await this.assertPendingBatch(userId, batchId);

    if (input.categoryId) {
      await this.assertOwnsCategory(userId, input.categoryId);
    }

    const existing = await this.prisma.stagedTransaction.findFirst({
      where: { id: rowId, batchId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy dòng này trong batch');
    }

    const row = await this.prisma.stagedTransaction.update({
      where: { id: rowId },
      data: {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.selected !== undefined ? { selected: input.selected } : {}),
      },
      select: STAGED_SELECT,
    });

    return toStagedRowDto(row);
  }

  /** Gán danh mục / bỏ tick cho nhiều dòng cùng lúc ở bước preview. */
  async bulkUpdateRows(
    userId: string,
    batchId: string,
    input: BulkUpdateStagedInput,
  ): Promise<{ updated: number }> {
    await this.assertPendingBatch(userId, batchId);

    if (input.categoryId) {
      await this.assertOwnsCategory(userId, input.categoryId);
    }

    // `batchId` trong where là thứ chặn việc sửa dòng của batch khác bằng cách
    // nhồi id lạ vào danh sách.
    const result = await this.prisma.stagedTransaction.updateMany({
      where: { id: { in: input.rowIds }, batchId },
      data: {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.selected !== undefined ? { selected: input.selected } : {}),
      },
    });

    return { updated: result.count };
  }

  /**
   * Commit batch: copy dòng đã tick sang `Transaction`.
   *
   * Toàn bộ nằm trong một DB transaction. Nếu tách ra, một lần crash giữa đường
   * để lại batch vừa có giao dịch vừa còn staged — không rollback được mà cũng
   * không confirm lại được.
   */
  async confirm(userId: string, batchId: string): Promise<ConfirmImportResultDto> {
    await this.assertPendingBatch(userId, batchId);

    return this.prisma.$transaction(async (tx) => {
      const staged = await tx.stagedTransaction.findMany({
        where: { batchId },
        select: {
          rowIndex: true,
          categoryId: true,
          amount: true,
          type: true,
          date: true,
          description: true,
          balance: true,
          dedupeHash: true,
          selected: true,
        },
        orderBy: { rowIndex: 'asc' },
      });

      const toInsert = staged.filter((row) => row.selected);

      const inserted = await tx.transaction.createMany({
        data: toInsert.map((row) => ({
          userId,
          categoryId: row.categoryId,
          amount: row.amount,
          type: row.type,
          date: row.date,
          description: row.description,
          balance: row.balance,
          dedupeHash: row.dedupeHash,
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

      return {
        batchId,
        inserted: inserted.count,
        skipped: staged.length - inserted.count,
      };
    });
  }

  /**
   * Rollback. Hành vi phụ thuộc trạng thái batch:
   *   pending   → xoá batch, staged bị xoá theo (onDelete: Cascade)
   *   confirmed → xoá các Transaction thuộc batch, đánh dấu rolled_back
   *
   * Batch confirmed KHÔNG bị xoá khỏi DB, để lịch sử import còn dấu vết là đã
   * từng có lần import này và nó đã bị hoàn lại.
   */
  async rollback(userId: string, batchId: string): Promise<{ removed: number }> {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, userId },
      select: { id: true, status: true },
    });

    if (!batch) {
      throw new NotFoundException('Không tìm thấy lần import này');
    }

    if (batch.status === 'rolled_back') {
      throw new ConflictException('Lần import này đã được hoàn lại trước đó');
    }

    if (batch.status === 'pending') {
      await this.prisma.importBatch.delete({ where: { id: batchId } });
      return { removed: 0 };
    }

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.transaction.deleteMany({
        where: { importBatchId: batchId, userId },
      });

      await tx.importBatch.update({
        where: { id: batchId },
        data: { status: 'rolled_back' },
      });

      return { removed: deleted.count };
    });
  }

  // ─── Nội bộ ────────────────────────────────────────────────────────────────

  /**
   * Chọn parser theo NỘI DUNG file, không theo đuôi tên.
   *
   * Đuôi file là thứ người dùng hoặc ngân hàng đặt, không phải thứ mô tả nội
   * dung — spec §4 nói phải sniff nội dung, và đây là chỗ làm việc đó. Trước khi
   * có hàm này, một file .xls đặt tên .xlsx đi thẳng vào XlsxParser, thư viện ném
   * lỗi ở tầng sâu, và người dùng nhận 500 trong khi họ thấy đuôi .xlsx trên máy.
   *
   * Tác dụng phụ tử tế: file CSV đặt tên .xlsx vẫn import được.
   */
  private pickParser(file: UploadedFile): StatementParser {
    const format = detectFormat(file.buffer);

    if (format === 'xlsx') {
      const parser = this.parsers.find((candidate) => candidate.source === 'xlsx');
      if (parser) return parser;
    }

    if (format === 'text') {
      const parser = this.parsers.find((candidate) => candidate.source === 'csv');
      if (parser) return parser;
    }

    // Định dạng nhận ra được nhưng không đọc được → 415 kèm cách sửa cụ thể.
    // Đây là lỗi của input, không phải lỗi hệ thống, nên không được là 500.
    throw new UnsupportedMediaTypeException(explainUnsupported(format, file.originalName));
  }

  private assertFileAcceptable(file: UploadedFile): void {
    if (file.size === 0) {
      throw new BadRequestException('File rỗng');
    }

    if (file.size > env.MAX_UPLOAD_BYTES) {
      const limitMb = Math.round(env.MAX_UPLOAD_BYTES / (1024 * 1024));
      throw new PayloadTooLargeException(`File vượt giới hạn ${limitMb}MB`);
    }
  }

  /**
   * Dò profile khi người dùng không chọn ngân hàng.
   *
   * Cách dò: thử từng candidate, chọn cái đọc được nhiều dòng nhất. Điều này quan
   * trọng với định dạng ngày — '01/02/2026' vừa có thể là 1/2 vừa có thể là 2/1,
   * không suy ra được từ một dòng. Nhưng nếu cả file dùng DD/MM thì profile
   * MM/DD sẽ vấp ở mọi dòng có ngày > 12, nên đếm số dòng đọc được là tín hiệu
   * đủ tốt để phân biệt.
   */
  private async parseWithProfile(
    parser: StatementParser,
    file: UploadedFile,
    bankProfileId?: string,
  ): Promise<{ result: Awaited<ReturnType<StatementParser['parse']>>; profile: BankProfile }> {
    if (bankProfileId) {
      const profile = findProfile(bankProfileId);
      if (!profile) {
        throw new BadRequestException(`Không có profile ngân hàng "${bankProfileId}"`);
      }
      return { result: await this.runParser(parser, file, profile), profile };
    }

    let best: { result: Awaited<ReturnType<StatementParser['parse']>>; profile: BankProfile } | null =
      null;

    for (const profile of AUTO_DETECT_CANDIDATES) {
      const result = await this.runParser(parser, file, profile);
      if (!best || result.rows.length > best.result.rows.length) {
        best = { result, profile };
      }
      // Đọc được hết, không lỗi dòng nào → không cần thử tiếp.
      if (result.rows.length > 0 && result.skipped.length === 0) break;
    }

    if (!best) {
      throw new BadRequestException('Không đọc được file');
    }

    return best;
  }

  /**
   * Gọi parser và biến lỗi của thư viện thành lỗi 4xx có nghĩa.
   *
   * `detectFormat` đã chặn phần lớn trường hợp, nhưng một file .xlsx hợp chữ ký
   * mà bên trong bị hỏng vẫn làm thư viện ném lỗi. Đó là lỗi của FILE, không phải
   * lỗi hệ thống — để nó rơi xuống 500 thì người dùng nhận stack trace và không
   * biết phải làm gì, còn log thì đầy "lỗi" mà không có gì cần sửa ở phía ta.
   */
  private async runParser(
    parser: StatementParser,
    file: UploadedFile,
    profile: BankProfile,
  ): Promise<Awaited<ReturnType<StatementParser['parse']>>> {
    try {
      return await parser.parse(file, profile);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Không parse được "${file.originalName}": ${detail}`);

      throw new BadRequestException(
        `Không đọc được nội dung "${file.originalName}". ` +
          `File có thể bị hỏng hoặc không phải bảng tính hợp lệ. ` +
          `Thử mở bằng Excel rồi lưu lại dưới dạng .xlsx hoặc .csv.`,
      );
    }
  }

  /**
   * Tìm những hash đã có trong DB.
   *
   * Chia lô để câu `IN (...)` không phình quá lớn với file 10.000 dòng — Postgres
   * xử lý được, nhưng driver và log thì bắt đầu khó chịu.
   */
  private async findExistingHashes(userId: string, hashes: string[]): Promise<Set<string>> {
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

  private async loadRules(userId: string): Promise<CategorizerRule[]> {
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

  /**
   * Dọn batch pending bị bỏ giữa đường. Gọi lazy khi tạo batch mới, không cần cron
   * — API là process long-running nên cron làm được, nhưng thêm hạ tầng cho một
   * việc này thì không đáng.
   */
  private async cleanupStalePendingBatches(userId: string): Promise<void> {
    try {
      await this.prisma.importBatch.deleteMany({
        where: {
          userId,
          status: 'pending',
          createdAt: { lt: new Date(Date.now() - PENDING_BATCH_TTL_MS) },
        },
      });
    } catch (error) {
      // Dọn rác thất bại không được làm hỏng việc import.
      this.logger.warn(`Không dọn được batch pending cũ: ${String(error)}`);
    }
  }

  private async assertPendingBatch(userId: string, batchId: string): Promise<void> {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, userId },
      select: { status: true },
    });

    if (!batch) {
      throw new NotFoundException('Không tìm thấy lần import này');
    }

    if (batch.status !== 'pending') {
      throw new ConflictException(
        batch.status === 'confirmed'
          ? 'Lần import này đã được xác nhận, không sửa được nữa'
          : 'Lần import này đã được hoàn lại',
      );
    }
  }

  private async assertOwnsCategory(userId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }
  }

  private async buildPreview(
    userId: string,
    batchId: string,
    skipped: SkippedRow[],
  ): Promise<ImportPreviewDto> {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, userId },
      select: {
        id: true,
        fileName: true,
        source: true,
        bankProfile: true,
        status: true,
        createdAt: true,
        staged: { select: STAGED_SELECT, orderBy: { rowIndex: 'asc' } },
      },
    });

    if (!batch) {
      throw new NotFoundException('Không tìm thấy lần import này');
    }

    const rows = batch.staged.map(toStagedRowDto);

    return {
      batchId: batch.id,
      fileName: batch.fileName,
      source: batch.source,
      bankProfile: batch.bankProfile,
      status: batch.status,
      createdAt: batch.createdAt.toISOString(),
      counts: buildCounts(rows, skipped.length),
      rows,
      skippedRows: skipped.map(toSkippedRowDto),
    };
  }
}

function toStagedRowDto(row: StagedRow): StagedRowDto {
  return {
    id: row.id,
    rowIndex: row.rowIndex,
    amount: toMoney(row.amount),
    type: row.type,
    date: toDateOnly(row.date),
    description: row.description,
    balance: toNullableMoney(row.balance),
    duplicate: row.duplicate,
    selected: row.selected,
    category: toCategorySummary(row.category),
    rawLine: row.rawLine,
  };
}

function toSkippedRowDto(row: SkippedRow): SkippedRowDto {
  return { rowIndex: row.rowIndex, raw: row.raw, reason: row.reason };
}

/**
 * Bảng đếm cho đầu trang preview.
 *
 * Người dùng cần trả lời được "bấm confirm thì thêm bao nhiêu, tổng bao nhiêu
 * tiền" TRƯỚC khi bấm — nên tổng thu/chi chỉ tính trên các dòng đang được tick,
 * không tính trên toàn bộ file.
 */
function buildCounts(rows: StagedRowDto[], skippedCount: number): ImportCountsDto {
  const selected = rows.filter((row) => row.selected);

  return {
    total: rows.length,
    willInsert: selected.length,
    duplicateInDb: rows.filter((row) => row.duplicate === 'in_db').length,
    uncategorized: rows.filter((row) => row.category === null).length,
    skipped: skippedCount,
    incomeTotal: sum(selected.filter((row) => row.type === 'income')),
    expenseTotal: sum(selected.filter((row) => row.type === 'expense')),
  };
}

function sum(rows: StagedRowDto[]): number {
  return rows.reduce((total, row) => total + row.amount, 0);
}
