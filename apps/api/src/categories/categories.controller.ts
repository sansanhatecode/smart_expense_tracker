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
} from '@nestjs/common';
import {
  createCategoryRuleSchema,
  createCategorySchema,
  updateCategoryRuleSchema,
  updateCategorySchema,
  type CategoryDto,
  type CategoryRuleDto,
  type CreateCategoryInput,
  type CreateCategoryRuleInput,
  type UpdateCategoryInput,
  type UpdateCategoryRuleInput,
} from '@expense/shared';
import { CurrentUserId } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CategoriesService } from './categories.service';

@Controller('api/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@CurrentUserId() userId: string): Promise<CategoryDto[]> {
    return this.categories.list(userId);
  }

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
  ): Promise<CategoryDto> {
    return this.categories.create(userId, body);
  }

  @Patch(':id')
  update(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ): Promise<CategoryDto> {
    return this.categories.update(userId, id, body);
  }

  /**
   * Trả về số giao dịch đã chuyển thành "chưa phân loại", để UI nói được điều đã
   * xảy ra thay vì chỉ báo "đã xoá".
   */
  @Delete(':id')
  remove(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<{ untaggedTransactions: number }> {
    return this.categories.remove(userId, id);
  }
}

@Controller('api/category-rules')
export class CategoryRulesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@CurrentUserId() userId: string): Promise<CategoryRuleDto[]> {
    return this.categories.listRules(userId);
  }

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(createCategoryRuleSchema)) body: CreateCategoryRuleInput,
  ): Promise<CategoryRuleDto> {
    return this.categories.createRule(userId, body);
  }

  @Patch(':id')
  update(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategoryRuleSchema)) body: UpdateCategoryRuleInput,
  ): Promise<CategoryRuleDto> {
    return this.categories.updateRule(userId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUserId() userId: string, @Param('id') id: string): Promise<void> {
    return this.categories.removeRule(userId, id);
  }
}
