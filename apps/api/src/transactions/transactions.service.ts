import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  numberToBigint,
  type BulkCategorizeInput,
  type BulkDeleteTransactionsInput,
  type CreateTransactionInput,
  type Paginated,
  type TransactionDto,
  type TransactionQuery,
  type UpdateTransactionInput,
} from '@expense/shared';
import { toCategorySummary, toDateOnly, toMoney, toNullableMoney } from '../common/mappers';
import { computeDedupeHash, dedupeGroupKey, normalizeDescription } from '../imports/dedupe';
import type { TxType } from '../generated/prisma/enums';
import {
  TransactionsRepository,
  type OwnedCategory,
  type TransactionPatch,
  type TransactionRow,
} from './transactions.repository';

@Injectable()
export class TransactionsService {
  constructor(private readonly transactions: TransactionsRepository) {}

  async list(userId: string, query: TransactionQuery): Promise<Paginated<TransactionDto>> {
    const { rows, total } = await this.transactions.findPage(userId, query);

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

    if (input.accountId) {
      await this.assertOwnsAccount(userId, input.accountId);
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

    const row = await this.transactions.create(userId, {
      categoryId: input.categoryId,
      accountId: input.accountId,
      amount,
      type: input.type,
      date: input.date,
      description: input.description,
      balance: input.balance === null ? null : numberToBigint(input.balance),
      internalKind: input.internalKind,
      dedupeHash: computeDedupeHash({
        userId,
        date: input.date,
        amount,
        type: input.type,
        normalizedDescription,
        seq,
      }),
    });

    return toTransactionDto(row);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateTransactionInput,
  ): Promise<TransactionDto> {
    const existing = await this.transactions.findOwned(userId, id);

    if (!existing) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    /*
     * Chiều tiền và danh mục SAU khi patch phải khớp nhau — và điều đó phải tính
     * trên giá trị sau, không phải trên field nào được gửi lên.
     *
     * Kiểm tra cũ nằm gọn trong `if (input.categoryId)`, nên `PATCH { type }` một
     * mình lọt qua: nó đổi chiều giao dịch mà để nguyên danh mục cũ, và một khoản
     * chi nằm trong danh mục thu là đúng thứ mà `assertOwnsCategory` sinh ra để
     * chặn. Hậu quả im lặng: `/stats/by-category` group theo (danh mục, chiều) nên
     * hiện danh mục chi trong khối thu, còn ngân sách lọc `type = 'expense'` thì
     * đánh rơi nó — hai chỗ lệch nhau mà không có gì báo.
     */
    const nextType = input.type ?? existing.type;

    if (input.categoryId) {
      await this.assertOwnsCategory(userId, input.categoryId, nextType);
    } else if (
      // Giữ nguyên danh mục cũ mà chiều lại đổi — nhánh trước đây không có.
      // `PATCH { description }` không rơi vào đây, nên sửa mô tả vẫn là một query.
      input.categoryId === undefined &&
      existing.categoryId !== null &&
      nextType !== existing.type
    ) {
      await this.assertKeptCategoryMatchesType(userId, existing.categoryId, nextType);
    }

    if (input.accountId) {
      await this.assertOwnsAccount(userId, input.accountId);
    }

    /**
     * Cố tình KHÔNG tính lại dedupeHash khi sửa.
     *
     * Hash tồn tại để nhận ra "dòng này đã import rồi", nên nó phải phản ánh dữ
     * liệu GỐC từ file. Nếu người dùng sửa mô tả rồi hash đổi theo, thì import
     * lại đúng file đó sẽ không còn nhận ra trùng và sinh thêm một bản.
     */
    const patch: TransactionPatch = {
      ...(input.amount !== undefined ? { amount: numberToBigint(input.amount) } : {}),
      type: input.type,
      date: input.date,
      description: input.description,
      categoryId: input.categoryId,
      accountId: input.accountId,
      ...(input.balance !== undefined
        ? { balance: input.balance === null ? null : numberToBigint(input.balance) }
        : {}),
      // Van an toàn cho nhận diện sai của import. Ví dụ người dùng trả hộ thẻ
      // của người khác: đó là chi tiêu thật, và họ phải bỏ đánh dấu được.
      internalKind: input.internalKind,
    };

    const row = await this.transactions.update(id, patch);

    return toTransactionDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.transactions.findOwned(userId, id);

    if (!existing) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    await this.transactions.delete(id);
  }

  /**
   * Gán danh mục cho nhiều giao dịch cùng lúc.
   *
   * Là thao tác đáng có riêng vì sau mỗi lần import sẽ còn một loạt giao dịch
   * chưa phân loại, và bắt người dùng sửa từng dòng là lý do họ bỏ dùng app.
   */
  async bulkCategorize(userId: string, input: BulkCategorizeInput): Promise<{ updated: number }> {
    if (input.categoryId) {
      const category = await this.assertOwnsCategory(userId, input.categoryId);

      /*
       * Chiều thu/chi phải khớp — cùng quy tắc với gán từng giao dịch, và vì đúng
       * cái lý do đã ghi ở `assertOwnsCategory`: gán khoản chi vào danh mục thu
       * làm thống kê theo danh mục ra số vô nghĩa mà không có gì báo lỗi.
       *
       * Chặn cả lô thay vì lặng lẽ bỏ qua các dòng lệch chiều: `updated` nhỏ hơn
       * số đã chọn là thứ người dùng không nhìn thấy, và họ sẽ tin là đã gán xong.
       *
       * 400 chứ không phải 404 như đường gán từng cái: ở đây danh mục CÓ tồn tại,
       * cái sai là tổ hợp đã chọn.
       */
      const mismatched = await this.transactions.countMismatchedType(
        userId,
        input.transactionIds,
        category.type,
      );

      if (mismatched > 0) {
        const categoryDirection = category.type === 'income' ? 'thu' : 'chi';
        const rowDirection = category.type === 'income' ? 'chi' : 'thu';

        throw new BadRequestException(
          `${mismatched} giao dịch đã chọn là giao dịch ${rowDirection}, không gán được vào ` +
            `danh mục ${categoryDirection} "${category.name}". Bỏ chọn những giao dịch ${rowDirection} rồi thử lại.`,
        );
      }
    }

    const updated = await this.transactions.setCategoryMany(
      userId,
      input.transactionIds,
      input.categoryId,
    );

    return { updated };
  }

  /**
   * Xoá nhiều giao dịch cùng lúc.
   *
   * Không kiểm sở hữu từng id trước rồi mới xoá: `deleteMany` đã lọc theo
   * `userId` nên id lạ không xoá được gì, và `deleted` nói đúng số dòng đã mất.
   * Kiểm trước chỉ thêm một vòng truy vấn cho cùng một kết quả.
   */
  async bulkDelete(
    userId: string,
    input: BulkDeleteTransactionsInput,
  ): Promise<{ deleted: number }> {
    const deleted = await this.transactions.deleteMany(userId, input.transactionIds);

    return { deleted };
  }

  /** Đếm số giao dịch đã có cùng khoá dedupe, kể cả phần mô tả đã normalize. */
  private async countSameGroup(
    userId: string,
    date: string,
    amount: bigint,
    type: TxType,
    normalizedDescription: string,
  ): Promise<number> {
    const descriptions = await this.transactions.findDescriptionsInGroup(
      userId,
      date,
      amount,
      type,
    );

    const target = dedupeGroupKey({ date, amount, type, normalizedDescription });

    return descriptions.filter(
      (description) =>
        dedupeGroupKey({
          date,
          amount,
          type,
          normalizedDescription: normalizeDescription(description),
        }) === target,
    ).length;
  }

  /**
   * Danh mục phải thuộc user, và chiều thu/chi phải khớp với giao dịch.
   *
   * Kiểm tra chiều là để không xảy ra chuyện gán giao dịch chi vào danh mục thu:
   * thống kê theo danh mục sẽ ra số vô nghĩa mà không có gì báo lỗi.
   *
   * Trả về danh mục để chỗ gọi dùng tiếp `type`/`name` mà không phải truy vấn
   * lại — đường bulk cần cả hai để tự kiểm chiều và viết được message cụ thể.
   */
  private async assertOwnsCategory(
    userId: string,
    categoryId: string,
    type?: TxType,
  ): Promise<OwnedCategory> {
    const category = await this.transactions.findOwnedCategory(userId, categoryId);

    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }

    if (type && category.type !== type) {
      throw new NotFoundException(
        `Danh mục "${category.name}" là danh mục ${category.type === 'income' ? 'thu' : 'chi'}, ` +
          `không dùng được cho giao dịch ${type === 'income' ? 'thu' : 'chi'}`,
      );
    }

    return category;
  }

  /**
   * Danh mục ĐANG GIỮ phải còn hợp lệ sau khi đổi chiều giao dịch.
   *
   * 400 chứ không phải 404 như đường chọn danh mục — cùng lý lẽ với `bulkCategorize`:
   * ở đây danh mục có tồn tại và thuộc về người dùng, cái sai là tổ hợp sau khi
   * sửa. Message phải nói được cách thoát, vì người dùng chỉ định đổi chiều thu/chi
   * và không nghĩ là mình đang đụng tới danh mục.
   */
  private async assertKeptCategoryMatchesType(
    userId: string,
    categoryId: string,
    type: TxType,
  ): Promise<void> {
    const category = await this.transactions.findOwnedCategory(userId, categoryId);

    // Danh mục bị xoá song song thì FK đã set null; không còn gì để kiểm.
    if (!category || category.type === type) {
      return;
    }

    const rowDirection = type === 'income' ? 'thu' : 'chi';
    const categoryDirection = category.type === 'income' ? 'thu' : 'chi';

    throw new BadRequestException(
      `Đổi thành giao dịch ${rowDirection} thì danh mục "${category.name}" không còn dùng được, ` +
        `vì đó là danh mục ${categoryDirection}. Gửi kèm danh mục ${rowDirection} mới, ` +
        `hoặc đặt danh mục về rỗng để chuyển giao dịch này sang "chưa phân loại".`,
    );
  }

  /** Chặn việc gắn giao dịch vào nguồn tiền của user khác bằng cách nhồi id lạ. */
  private async assertOwnsAccount(userId: string, accountId: string): Promise<void> {
    const account = await this.transactions.findOwnedAccount(userId, accountId);

    if (!account) {
      throw new NotFoundException('Không tìm thấy nguồn tiền');
    }
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
    account: row.account,
    internalKind: row.internalKind,
    importBatchId: row.importBatchId,
    createdAt: row.createdAt.toISOString(),
  };
}
