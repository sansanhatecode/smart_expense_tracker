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
import { detectAccount } from './account-detect';
import { beatsBest } from './detect-profile';
import { AUTO_DETECT_CANDIDATES, findProfile } from './bank-profiles';
import { categorize } from './categorizer';
import { assignSequences, computeDedupeHash } from './dedupe';
import { detectFormat, explainUnsupported } from './detect-format';
import { buildMccRules } from './mcc';
import { normalize } from './normalizer';
import { CsvParser } from './parsers/csv.parser';
import { XlsxParser } from './parsers/xlsx.parser';
import { ImportsRepository, type StagedInsert, type StagedRow } from './imports.repository';
import type {
  BankProfile,
  SkippedRow,
  StatementParser,
  UploadedFile,
} from './types';
import { toCategorySummary, toDateOnly, toMoney, toNullableMoney } from '../common/mappers';
import type { TxType } from '../generated/prisma/enums';
import { env } from '../config/env';

/** Batch pending cũ hơn mốc này bị dọn — người dùng đã bỏ giữa đường. */
const PENDING_BATCH_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);
  private readonly parsers: StatementParser[] = [new CsvParser(), new XlsxParser()];

  constructor(private readonly imports: ImportsRepository) {}

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

    // Nguồn tiền suy ra từ dòng GỐC (còn dấu, còn cột MCC), trước khi normalize
    // — và normalize cần biết kết quả để phân loại khoản nội bộ.
    const detected = detectAccount(profile, result.rows);

    const { rows: normalized, skipped: normalizeSkipped } = normalize(
      result.rows,
      profile,
      detected.kind,
    );
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

    const [existingHashes, rules, categories] = await Promise.all([
      this.imports.findExistingHashes(
        userId,
        hashed.map((row) => row.dedupeHash),
      ),
      this.imports.findRules(userId),
      // Bảng MCC là hằng số trong code và chỉ biết TÊN danh mục — id thì mỗi user
      // một khác, nên phải đọc danh mục ra để dựng bảng tra. Xem đầu ./mcc.ts.
      this.imports.findCategories(userId),
    ]);

    const mccRules = buildMccRules(categories);

    void this.cleanupStalePendingBatches(userId);

    const rows: StagedInsert[] = hashed.map((row) => {
      const isDuplicate = existingHashes.has(row.dedupeHash);

      return {
        rowIndex: row.rowIndex,
        categoryId: categorize(row, rules, mccRules),
        amount: row.amount,
        type: row.type,
        date: row.date,
        description: row.description,
        balance: row.balance,
        dedupeHash: row.dedupeHash,
        internalKind: row.internalKind,
        duplicate: isDuplicate ? 'in_db' : 'none',
        // Dòng trùng mặc định BỎ TICK: mặc định an toàn là không thêm lại thứ
        // đã có. Người dùng vẫn tick lại được nếu biết mình đang làm gì.
        selected: !isDuplicate,
        rawLine: row.raw,
      };
    });

    const batch = await this.imports.createBatch({
      userId,
      source: parser.source,
      fileName: file.originalName,
      bankProfile: profile.id,
      account: {
        fingerprint: detected.fingerprint,
        name: detected.name,
        kind: detected.kind,
      },
      rows,
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
    const rows = await this.imports.findBatches(userId);

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

    // Tìm dòng TRƯỚC khi kiểm danh mục: cần `type` của nó mới biết danh mục có
    // đúng chiều không.
    const existing = await this.imports.findStagedRow(batchId, rowId);

    if (!existing) {
      throw new NotFoundException('Không tìm thấy dòng này trong batch');
    }

    if (input.categoryId) {
      await this.assertOwnsCategory(userId, input.categoryId, existing.type);
    }

    const row = await this.imports.updateStagedRow(rowId, {
      categoryId: input.categoryId,
      selected: input.selected,
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
      const category = await this.assertOwnsCategory(userId, input.categoryId);

      /*
       * Chặn cả lô khi có dòng lệch chiều, giống `bulkCategorize` ở
       * transactions.service và vì đúng lý do đó: gán một phần rồi trả về
       * `updated` nhỏ hơn số đã chọn là thứ người dùng không nhìn thấy, và họ sẽ
       * tin là đã gán xong.
       *
       * Ở đây không kiểm được bằng `assertOwnsCategory` như đường một dòng, vì
       * lô có thể trộn cả dòng thu lẫn dòng chi — phải đếm.
       */
      const mismatched = await this.imports.countMismatchedType(
        batchId,
        input.rowIds,
        category.type,
      );

      if (mismatched > 0) {
        const categoryDirection = category.type === 'income' ? 'thu' : 'chi';
        const rowDirection = category.type === 'income' ? 'chi' : 'thu';

        throw new BadRequestException(
          `${mismatched} dòng đã chọn là giao dịch ${rowDirection}, không gán được vào ` +
            `danh mục ${categoryDirection} "${category.name}". Bỏ chọn những dòng ${rowDirection} rồi thử lại.`,
        );
      }
    }

    const updated = await this.imports.updateStagedRows(batchId, input.rowIds, {
      categoryId: input.categoryId,
      selected: input.selected,
    });

    return { updated };
  }

  /** Commit batch: copy dòng đã tick sang `Transaction`. */
  async confirm(userId: string, batchId: string): Promise<ConfirmImportResultDto> {
    await this.assertPendingBatch(userId, batchId);

    const { inserted, staged } = await this.imports.confirmBatch(userId, batchId);

    return {
      batchId,
      inserted,
      skipped: staged - inserted,
    };
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
    const batch = await this.imports.findOwnedBatch(userId, batchId);

    if (!batch) {
      throw new NotFoundException('Không tìm thấy lần import này');
    }

    if (batch.status === 'rolled_back') {
      throw new ConflictException('Lần import này đã được hoàn lại trước đó');
    }

    if (batch.status === 'pending') {
      await this.imports.deleteBatch(batchId);
      return { removed: 0 };
    }

    const removed = await this.imports.rollbackConfirmedBatch(userId, batchId);

    return { removed };
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
   *
   * Hoà số dòng thì profile khớp CHỮ KÝ CỘT thắng. Chỉ đếm dòng là chưa đủ:
   * generic đọc trọn một file MoMo y hệt profile MoMo và luôn được thử trước,
   * nên MoMo không bao giờ thắng — file ví bị xếp thành tài khoản ngân hàng,
   * gộp chung với ngân hàng thật, và khoản nạp ví thành thu nhập.
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
      if (!best || beatsBest(result, best.result)) {
        best = { result, profile };
      }
      // Đọc được hết, không lỗi dòng nào, và không profile nào sau đó có thể
      // khớp chữ ký tốt hơn → dừng sớm.
      if (result.rows.length > 0 && result.skipped.length === 0 && result.signatureMatched) {
        break;
      }
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
   * Dọn batch pending bị bỏ giữa đường. Gọi lazy khi tạo batch mới, không cần cron
   * — API là process long-running nên cron làm được, nhưng thêm hạ tầng cho một
   * việc này thì không đáng.
   */
  private async cleanupStalePendingBatches(userId: string): Promise<void> {
    try {
      await this.imports.deleteStalePendingBatches(
        userId,
        new Date(Date.now() - PENDING_BATCH_TTL_MS),
      );
    } catch (error) {
      // Dọn rác thất bại không được làm hỏng việc import.
      this.logger.warn(`Không dọn được batch pending cũ: ${String(error)}`);
    }
  }

  private async assertPendingBatch(userId: string, batchId: string): Promise<void> {
    const batch = await this.imports.findOwnedBatch(userId, batchId);

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

  /**
   * Danh mục phải thuộc user, và nếu biết chiều của dòng thì phải khớp chiều đó.
   *
   * Bước preview trước đây chỉ kiểm sở hữu, nên nó là đường vòng qua quy tắc mà
   * transactions.service chặn rất kỹ: gán danh mục thu cho một dòng chi ở đây thì
   * `confirm` ghi thẳng vào `Transaction` bằng `createMany`, không đi qua
   * transactions.service một bước nào. UI đã lọc theo chiều rồi, nhưng UI không
   * phải là ranh giới — API mới là.
   *
   * Trả về danh mục để chỗ gọi dùng tiếp `type`/`name` mà không phải truy vấn lại.
   */
  private async assertOwnsCategory(
    userId: string,
    categoryId: string,
    type?: TxType,
  ): Promise<{ id: string; type: TxType; name: string }> {
    const category = await this.imports.findOwnedCategory(userId, categoryId);

    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }

    // 404 giống đường gán từng giao dịch ở transactions.service, để hai đường nói
    // cùng một thứ tiếng khi người dùng chọn nhầm danh mục.
    if (type && category.type !== type) {
      throw new NotFoundException(
        `Danh mục "${category.name}" là danh mục ${category.type === 'income' ? 'thu' : 'chi'}, ` +
          `không dùng được cho giao dịch ${type === 'income' ? 'thu' : 'chi'}`,
      );
    }

    return category;
  }

  private async buildPreview(
    userId: string,
    batchId: string,
    skipped: SkippedRow[],
  ): Promise<ImportPreviewDto> {
    const batch = await this.imports.findBatchWithStaged(userId, batchId);

    if (!batch) {
      throw new NotFoundException('Không tìm thấy lần import này');
    }

    const rows = batch.staged.map(toStagedRowDto);

    return {
      batchId: batch.id,
      fileName: batch.fileName,
      source: batch.source,
      bankProfile: batch.bankProfile,
      account: batch.account,
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
