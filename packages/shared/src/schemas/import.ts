import { z } from 'zod';
import {
  importSourceSchema,
  importStatusSchema,
  type ImportSource,
  type ImportStatus,
  type TxType,
} from '../common';
import type { CategoryDto } from './category';

/** Vì sao một dòng bị coi là trùng. Xem ADR 9.8. */
export const duplicateKindSchema = z.enum(['none', 'in_batch', 'in_db']);
export type DuplicateKind = z.infer<typeof duplicateKindSchema>;

export const uploadImportSchema = z.object({
  /** Id của BankProfile; bỏ trống thì API tự dò. */
  bankProfile: z.string().min(1).optional(),
});

export type UploadImportInput = z.infer<typeof uploadImportSchema>;

export interface StagedRowDto {
  id: string;
  rowIndex: number;
  amount: number;
  type: TxType;
  /** 'YYYY-MM-DD' */
  date: string;
  description: string;
  balance: number | null;
  duplicate: DuplicateKind;
  selected: boolean;
  category: Pick<CategoryDto, 'id' | 'name' | 'type' | 'icon' | 'color'> | null;
  /** Dòng gốc trong file, để đối chiếu khi parse sai. */
  rawLine: string;
}

/**
 * Bảng đếm hiển thị ngay đầu trang preview — người dùng cần trả lời được
 * "import cái này thì thêm bao nhiêu giao dịch?" trước khi bấm confirm.
 */
export interface ImportCountsDto {
  total: number;
  /** Số dòng sẽ thực sự được thêm nếu confirm ngay bây giờ. */
  willInsert: number;
  duplicateInBatch: number;
  duplicateInDb: number;
  uncategorized: number;
  /** Tổng thu / chi của các dòng sẽ được thêm. */
  incomeTotal: number;
  expenseTotal: number;
}

export interface ImportPreviewDto {
  batchId: string;
  fileName: string;
  source: ImportSource;
  bankProfile: string | null;
  status: ImportStatus;
  createdAt: string;
  counts: ImportCountsDto;
  rows: StagedRowDto[];
}

export const updateStagedRowSchema = z
  .object({
    categoryId: z.string().min(1).nullable().optional(),
    selected: z.boolean().optional(),
  })
  .refine((v) => v.categoryId !== undefined || v.selected !== undefined, {
    message: 'Không có gì để cập nhật',
  });

export type UpdateStagedRowInput = z.infer<typeof updateStagedRowSchema>;

/** Gán danh mục cho nhiều dòng preview cùng lúc. */
export const bulkUpdateStagedSchema = z.object({
  rowIds: z.array(z.string().min(1)).min(1).max(1000),
  categoryId: z.string().min(1).nullable().optional(),
  selected: z.boolean().optional(),
});

export type BulkUpdateStagedInput = z.infer<typeof bulkUpdateStagedSchema>;

export interface ConfirmImportResultDto {
  batchId: string;
  inserted: number;
  /** Bỏ qua vì trùng hoặc vì user bỏ tick. */
  skipped: number;
}

export interface ImportBatchDto {
  id: string;
  fileName: string;
  source: ImportSource;
  bankProfile: string | null;
  status: ImportStatus;
  rowCount: number;
  /** Số giao dịch còn sống thuộc batch này (0 nếu đã rollback). */
  transactionCount: number;
  createdAt: string;
  confirmedAt: string | null;
}

/** Mô tả một BankProfile cho FE dựng dropdown chọn ngân hàng. */
export interface BankProfileDto {
  id: string;
  bank: string;
  label: string;
  source: ImportSource[];
}

export { importSourceSchema, importStatusSchema };
