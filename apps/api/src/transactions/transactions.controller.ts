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
  createTransactionSchema,
  transactionQuerySchema,
  updateTransactionSchema,
  type BulkCategorizeInput,
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUserId() userId: string, @Param('id') id: string): Promise<void> {
    return this.transactions.remove(userId, id);
  }
}
