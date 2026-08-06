import { z } from 'zod';
import {
  importSourceSchema,
  importStatusSchema,
  type AccountKind,
  type ImportSource,
  type ImportStatus,
  type TxType,
} from '../common';
import type { CategoryDto } from './category';

/**
 * Vì sao một dòng bị coi là trùng.
 *
 * Không có `in_batch`: theo cách tính hash ở ADR 9.8, mỗi dòng trong cùng batch
 * có `seq` riêng nên không bao giờ trùng hash nhau — hai dòng giống hệt nhau
 * trong một file là hai giao dịch thật, không phải một dòng bị lặp.
 */
export const duplicateKindSchema = z.enum(['none', 'in_db']);
export type DuplicateKind = z.infer<typeof duplicateKindSchema>;

export const uploadImportSchema = z.object({
  /** Id của BankProfile; bỏ trống thì API tự dò. */
  bankProfile: z.string().min(1).optional(),
  /**
   * Tên thẻ, tuỳ chọn — chỉ có ý nghĩa khi file là sao kê thẻ tín dụng. Dùng
   * để tách nhiều thẻ cùng ngân hàng thành nhiều nguồn tiền riêng, xem
   * account-detect.ts.
   */
  cardName: z.string().trim().max(80).optional(),
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
  /** Số dòng parse được từ file. */
  total: number;
  /** Số dòng sẽ thực sự được thêm nếu confirm ngay bây giờ. */
  willInsert: number;
  /** Trùng với giao dịch đã có trong DB — mặc định bỏ tick. */
  duplicateInDb: number;
  /** Chưa có danh mục, cần người dùng gán. */
  uncategorized: number;
  /** Dòng parser không đọc được (dòng tổng cộng, ghi chú…). */
  skipped: number;
  /** Tổng thu / chi của các dòng sẽ được thêm. */
  incomeTotal: number;
  expenseTotal: number;
}

/** Dòng file không đọc được, kèm lý do — hiện ở preview để người dùng đối chiếu. */
export interface SkippedRowDto {
  rowIndex: number;
  raw: string;
  reason: string;
}

export interface ImportPreviewDto {
  batchId: string;
  fileName: string;
  source: ImportSource;
  bankProfile: string | null;
  /**
   * Nguồn tiền suy ra từ nội dung file. Hiện ở preview để người dùng thấy hệ
   * thống hiểu file này là gì TRƯỚC khi confirm — nhận nhầm sao kê thẻ thành
   * tài khoản ngân hàng sẽ làm dư nợ và dòng tiền sai, và họ là người duy nhất
   * phát hiện được.
   */
  account: { id: string; name: string; kind: AccountKind } | null;
  status: ImportStatus;
  createdAt: string;
  counts: ImportCountsDto;
  rows: StagedRowDto[];
  /**
   * Các dòng parser không đọc được. Trả về thay vì lặng lẽ bỏ, vì "file có 50
   * dòng mà chỉ import 48" là điều người dùng cần biết lý do.
   */
  skippedRows: SkippedRowDto[];
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
