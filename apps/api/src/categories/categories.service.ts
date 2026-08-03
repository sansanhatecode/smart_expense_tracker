import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CategoryDto,
  CategoryRuleDto,
  CreateCategoryInput,
  CreateCategoryRuleInput,
  UpdateCategoryInput,
  UpdateCategoryRuleInput,
} from '@expense/shared';
import { toCategoryDto, toCategorySummary } from '../common/mappers';
import { CategoriesRepository, type RuleRow } from './categories.repository';

@Injectable()
export class CategoriesService {
  constructor(private readonly categories: CategoriesRepository) {}

  async list(userId: string): Promise<CategoryDto[]> {
    const rows = await this.categories.findAll(userId);

    return rows.map(toCategoryDto);
  }

  async create(userId: string, input: CreateCategoryInput): Promise<CategoryDto> {
    const row = await this.categories.create(userId, {
      name: input.name,
      type: input.type,
      icon: input.icon,
      color: input.color,
      sortOrder: input.sortOrder,
    });

    return toCategoryDto(row);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryDto> {
    const existing = await this.categories.findOwned(userId, id);

    // Lọc theo userId rồi trả 404 (không phải 403) khi không thấy: 403 sẽ tiết
    // lộ rằng id đó có tồn tại và thuộc người khác.
    if (!existing) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }

    // Đổi `type` khi đã có giao dịch sẽ làm mọi giao dịch cũ nằm sai chiều —
    // và thống kê theo thu/chi lệch mà không có gì báo. Chặn thẳng.
    if (input.type !== undefined && input.type !== existing.type) {
      if (existing._count.transactions > 0) {
        throw new BadRequestException(
          `Không thể đổi loại thu/chi của danh mục đang có ${existing._count.transactions} giao dịch. ` +
            `Hãy tạo danh mục mới và chuyển giao dịch sang đó.`,
        );
      }
    }

    const row = await this.categories.update(id, {
      name: input.name,
      type: input.type,
      icon: input.icon,
      color: input.color,
      sortOrder: input.sortOrder,
    });

    return toCategoryDto(row);
  }

  /**
   * Xoá danh mục. Giao dịch KHÔNG bị xoá theo — chúng chuyển sang "chưa phân
   * loại" (FK là onDelete: SetNull).
   *
   * Đây là lựa chọn có chủ ý: dữ liệu giao dịch là thứ người dùng nhập/import
   * vào, còn danh mục chỉ là cách sắp xếp nó. Xoá cách sắp xếp không được phép
   * làm mất dữ liệu gốc.
   */
  async remove(userId: string, id: string): Promise<{ untaggedTransactions: number }> {
    const existing = await this.categories.findOwned(userId, id);

    if (!existing) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }

    await this.categories.delete(id);

    return { untaggedTransactions: existing._count.transactions };
  }

  // ─── Rule auto-categorize ──────────────────────────────────────────────────

  async listRules(userId: string): Promise<CategoryRuleDto[]> {
    const rows = await this.categories.findAllRules(userId);

    return rows.map(toRuleDto);
  }

  async createRule(userId: string, input: CreateCategoryRuleInput): Promise<CategoryRuleDto> {
    await this.assertOwnsCategory(userId, input.categoryId);

    const row = await this.categories.createRule(userId, {
      // Uppercase ở đúng một chỗ (đây), để so khớp không phải lo về hoa thường.
      keyword: input.keyword.toUpperCase(),
      categoryId: input.categoryId,
      priority: input.priority,
    });

    return toRuleDto(row);
  }

  async updateRule(
    userId: string,
    id: string,
    input: UpdateCategoryRuleInput,
  ): Promise<CategoryRuleDto> {
    const existing = await this.categories.findOwnedRule(userId, id);

    if (!existing) {
      throw new NotFoundException('Không tìm thấy rule');
    }

    if (input.categoryId !== undefined) {
      await this.assertOwnsCategory(userId, input.categoryId);
    }

    const row = await this.categories.updateRule(id, {
      ...(input.keyword !== undefined ? { keyword: input.keyword.toUpperCase() } : {}),
      categoryId: input.categoryId,
      priority: input.priority,
    });

    return toRuleDto(row);
  }

  async removeRule(userId: string, id: string): Promise<void> {
    const existing = await this.categories.findOwnedRule(userId, id);

    if (!existing) {
      throw new NotFoundException('Không tìm thấy rule');
    }

    await this.categories.deleteRule(id);
  }

  /**
   * Chặn việc gán rule vào danh mục của người khác.
   *
   * Không dựa vào FK constraint được: FK chỉ biết category có tồn tại, không
   * biết nó thuộc ai — nên nếu thiếu kiểm tra này thì user A có thể tạo rule
   * trỏ vào category của user B.
   */
  private async assertOwnsCategory(userId: string, categoryId: string): Promise<void> {
    const category = await this.categories.findOwned(userId, categoryId);

    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }
  }
}

function toRuleDto(row: RuleRow): CategoryRuleDto {
  return {
    id: row.id,
    keyword: row.keyword,
    priority: row.priority,
    category: toCategorySummary(row.category)!,
  };
}
