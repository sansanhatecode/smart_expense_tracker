import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  budgetQuerySchema,
  upsertBudgetSchema,
  type BudgetAlertDto,
  type BudgetDto,
  type BudgetQuery,
  type UpsertBudgetInput,
} from '@expense/shared';
import { CurrentUserId } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BudgetsService } from './budgets.service';

@Controller('api/budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  list(
    @CurrentUserId() userId: string,
    @Query(new ZodValidationPipe(budgetQuerySchema)) query: BudgetQuery,
  ): Promise<BudgetDto[]> {
    return this.budgets.list(userId, query.month);
  }

  /** Đặt trước ':id' để 'alerts' không bị bắt như một id. */
  @Get('alerts')
  alerts(
    @CurrentUserId() userId: string,
    @Query(new ZodValidationPipe(budgetQuerySchema)) query: BudgetQuery,
  ): Promise<BudgetAlertDto[]> {
    return this.budgets.alerts(userId, query.month);
  }

  /**
   * Upsert: "đặt ngân sách X cho danh mục Y tháng Z" là một hành động từ góc nhìn
   * người dùng, họ không cần biết trước đó đã đặt hay chưa.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  upsert(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(upsertBudgetSchema)) body: UpsertBudgetInput,
  ): Promise<BudgetDto> {
    return this.budgets.upsert(userId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUserId() userId: string, @Param('id') id: string): Promise<void> {
    return this.budgets.remove(userId, id);
  }
}
