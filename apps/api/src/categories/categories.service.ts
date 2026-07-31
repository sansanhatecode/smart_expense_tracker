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
import { PrismaService } from '../prisma/prisma.service';

const CATEGORY_SELECT = {
  id: true,
  name: true,
  type: true,
  icon: true,
  color: true,
  sortOrder: true,
} as const;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      where: { userId },
      select: { ...CATEGORY_SELECT, _count: { select: { transactions: true } } },
      // Thu trước chi, rồi theo sortOrder — thứ tự ổn định để UI không nhảy.
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    return rows.map(toCategoryDto);
  }

  async create(userId: string, input: CreateCategoryInput): Promise<CategoryDto> {
    const row = await this.prisma.category.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder,
      },
      select: CATEGORY_SELECT,
    });

    return toCategoryDto(row);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryDto> {
    const existing = await this.prisma.category.findFirst({
      where: { id, userId },
      select: { id: true, type: true, _count: { select: { transactions: true } } },
    });

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

    const row = await this.prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
      select: CATEGORY_SELECT,
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
    const existing = await this.prisma.category.findFirst({
      where: { id, userId },
      select: { id: true, _count: { select: { transactions: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }

    await this.prisma.category.delete({ where: { id } });

    return { untaggedTransactions: existing._count.transactions };
  }

  // ─── Rule auto-categorize ──────────────────────────────────────────────────

  async listRules(userId: string): Promise<CategoryRuleDto[]> {
    const rows = await this.prisma.categoryRule.findMany({
      where: { userId },
      select: {
        id: true,
        keyword: true,
        priority: true,
        category: { select: CATEGORY_SELECT },
      },
      // priority cao trước, để danh sách hiển thị đúng thứ tự thắng khi khớp.
      orderBy: [{ priority: 'desc' }, { keyword: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      keyword: row.keyword,
      priority: row.priority,
      category: toCategorySummary(row.category)!,
    }));
  }

  async createRule(userId: string, input: CreateCategoryRuleInput): Promise<CategoryRuleDto> {
    await this.assertOwnsCategory(userId, input.categoryId);

    const row = await this.prisma.categoryRule.create({
      data: {
        userId,
        // Uppercase ở đúng một chỗ (đây), để so khớp không phải lo về hoa thường.
        keyword: input.keyword.toUpperCase(),
        categoryId: input.categoryId,
        priority: input.priority,
      },
      select: {
        id: true,
        keyword: true,
        priority: true,
        category: { select: CATEGORY_SELECT },
      },
    });

    return {
      id: row.id,
      keyword: row.keyword,
      priority: row.priority,
      category: toCategorySummary(row.category)!,
    };
  }

  async updateRule(
    userId: string,
    id: string,
    input: UpdateCategoryRuleInput,
  ): Promise<CategoryRuleDto> {
    const existing = await this.prisma.categoryRule.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy rule');
    }

    if (input.categoryId !== undefined) {
      await this.assertOwnsCategory(userId, input.categoryId);
    }

    const row = await this.prisma.categoryRule.update({
      where: { id },
      data: {
        ...(input.keyword !== undefined ? { keyword: input.keyword.toUpperCase() } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      },
      select: {
        id: true,
        keyword: true,
        priority: true,
        category: { select: CATEGORY_SELECT },
      },
    });

    return {
      id: row.id,
      keyword: row.keyword,
      priority: row.priority,
      category: toCategorySummary(row.category)!,
    };
  }

  async removeRule(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.categoryRule.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy rule');
    }

    await this.prisma.categoryRule.delete({ where: { id } });
  }

  /**
   * Chặn việc gán rule vào danh mục của người khác.
   *
   * Không dựa vào FK constraint được: FK chỉ biết category có tồn tại, không
   * biết nó thuộc ai — nên nếu thiếu kiểm tra này thì user A có thể tạo rule
   * trỏ vào category của user B.
   */
  private async assertOwnsCategory(userId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }
  }
}
