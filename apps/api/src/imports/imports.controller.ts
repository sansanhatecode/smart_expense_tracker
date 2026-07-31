import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile as UploadedFileParam,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  bulkUpdateStagedSchema,
  updateStagedRowSchema,
  type BankProfileDto,
  type BulkUpdateStagedInput,
  type ConfirmImportResultDto,
  type ImportBatchDto,
  type ImportPreviewDto,
  type StagedRowDto,
  type UpdateStagedRowInput,
} from '@expense/shared';
import { CurrentUserId } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { env } from '../config/env';
import { BANK_PROFILES } from './bank-profiles';
import { ImportsService } from './imports.service';
import type { UploadedFile } from './types';

@Controller('api/imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  /** Danh sách profile cho FE dựng dropdown chọn ngân hàng. */
  @Get('bank-profiles')
  bankProfiles(): BankProfileDto[] {
    return BANK_PROFILES.map((profile) => ({
      id: profile.id,
      bank: profile.bank,
      label: profile.label,
      source: profile.source,
    }));
  }

  @Get()
  listBatches(@CurrentUserId() userId: string): Promise<ImportBatchDto[]> {
    return this.imports.listBatches(userId);
  }

  /**
   * Upload → trả preview. KHÔNG ghi vào `Transaction`; xem ADR 9.6.
   *
   * Dùng memoryStorage (mặc định của multer khi không cấu hình dest): file sao kê
   * cá nhân nhỏ và ta chỉ cần parse nó một lần, nên ghi ra đĩa rồi đọc lại chỉ
   * thêm việc dọn file tạm.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: env.MAX_UPLOAD_BYTES } }))
  upload(
    @CurrentUserId() userId: string,
    @UploadedFileParam() file: Express.Multer.File | undefined,
    @Body('bankProfile') bankProfile?: string,
  ): Promise<ImportPreviewDto> {
    if (!file) {
      throw new BadRequestException('Chưa chọn file. Gửi file trong field "file".');
    }

    const uploaded: UploadedFile = {
      originalName: decodeOriginalName(file.originalname),
      buffer: file.buffer,
      mimeType: file.mimetype,
      size: file.size,
    };

    return this.imports.createBatch(userId, uploaded, bankProfile);
  }

  @Get(':id')
  preview(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<ImportPreviewDto> {
    return this.imports.getPreview(userId, id);
  }

  /** Đặt trước ':rowId' để 'bulk' không bị bắt như một rowId. */
  @Patch(':id/rows/bulk')
  bulkUpdate(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(bulkUpdateStagedSchema)) body: BulkUpdateStagedInput,
  ): Promise<{ updated: number }> {
    return this.imports.bulkUpdateRows(userId, id, body);
  }

  @Patch(':id/rows/:rowId')
  updateRow(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('rowId') rowId: string,
    @Body(new ZodValidationPipe(updateStagedRowSchema)) body: UpdateStagedRowInput,
  ): Promise<StagedRowDto> {
    return this.imports.updateRow(userId, id, rowId, body);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<ConfirmImportResultDto> {
    return this.imports.confirm(userId, id);
  }

  @Delete(':id')
  rollback(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<{ removed: number }> {
    return this.imports.rollback(userId, id);
  }
}

/**
 * Tên file có dấu tiếng Việt bị multer đọc thành latin1 (giới hạn của
 * multipart/form-data), nên "sao-kê.csv" ra "sao-kÃª.csv". Đọc lại thành utf8.
 *
 * Chỉ chuyển khi kết quả có ký tự tiếng Việt: nếu tên file vốn đã đúng ASCII thì
 * chuyển đổi này là vô hại, nhưng nếu client đã gửi utf8 đúng chuẩn thì chuyển
 * lại sẽ làm hỏng — nên kiểm tra trước.
 */
function decodeOriginalName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  // Ký tự thay thế U+FFFD nghĩa là chuỗi gốc không phải latin1 → giữ nguyên
  return decoded.includes('�') ? name : decoded;
}
