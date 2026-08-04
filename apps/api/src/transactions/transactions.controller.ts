import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  bulkCategorizeSchema,
  bulkDeleteTransactionsSchema,
  createTransactionSchema,
  transactionQuerySchema,
  updateTransactionSchema,
  type BulkCategorizeInput,
  type BulkDeleteTransactionsInput,
  type CreateTransactionInput,
  type Paginated,
  type TransactionDto,
  type TransactionQuery,
  type UpdateTransactionInput,
} from '@expense/shared';
import { CurrentUserId } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TransactionsService } from './transactions.service';

@Controller('api/transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(
    @CurrentUserId() userId: string,
    @Query(new ZodValidationPipe(transactionQuerySchema)) query: TransactionQuery,
  ): Promise<Paginated<TransactionDto>> {
    return this.transactions.list(userId, query);
  }

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(createTransactionSchema)) body: CreateTransactionInput,
  ): Promise<TransactionDto> {
    return this.transactions.create(userId, body);
  }

  /** Đặt trước `:id` để 'bulk-categorize' không bị bắt như một id. */
  @Patch('bulk-categorize')
  bulkCategorize(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(bulkCategorizeSchema)) body: BulkCategorizeInput,
  ): Promise<{ updated: number }> {
    return this.transactions.bulkCategorize(userId, body);
  }

  @Patch(':id')
  update(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTransactionSchema)) body: UpdateTransactionInput,
  ): Promise<TransactionDto> {
    return this.transactions.update(userId, id, body);
  }

  /**
   * Xoá nhiều giao dịch: `DELETE` lên chính collection, danh sách id nằm ở body.
   *
   * Không phải `POST /bulk-delete`: đường dẫn này không đụng `:id` (khác số đoạn)
   * nên không cần đặt trước, và một thao tác xoá thì method phải là DELETE.
   *
   * Trả về số dòng đã xoá thay vì 204: người dùng cần biết "đã xoá 12" để đối
   * chiếu với số mình vừa chọn.
   */
  @Delete()
  bulkRemove(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(bulkDeleteTransactionsSchema))
    body: BulkDeleteTransactionsInput,
  ): Promise<{ deleted: number }> {
    return this.transactions.bulkDelete(userId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUserId() userId: string, @Param('id') id: string): Promise<void> {
    return this.transactions.remove(userId, id);
  }
}
