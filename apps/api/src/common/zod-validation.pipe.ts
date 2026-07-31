import { BadRequestException, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validate bằng đúng schema mà FE dùng cho form, lấy từ `@expense/shared`.
 *
 * Đây là lý do tồn tại của packages/shared: không có class DTO riêng ở BE để
 * lệch khỏi FE, vì cả hai đọc cùng một schema.
 *
 * Dùng: `@Body(new ZodValidationPipe(createTransactionSchema)) body: CreateTransactionInput`
 */
export class ZodValidationPipe<TOutput> implements PipeTransform {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): TOutput {
    const result = this.schema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    // Gom lỗi theo field để FE gắn được vào từng input, thay vì chỉ hiện một
    // dòng chung chung ở đầu form.
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length > 0 ? issue.path.join('.') : '_';
      const bucket = fieldErrors[key];
      if (bucket) {
        bucket.push(issue.message);
      } else {
        fieldErrors[key] = [issue.message];
      }
    }

    const firstIssue = result.error.issues[0];
    throw new BadRequestException({
      message: firstIssue?.message ?? 'Dữ liệu không hợp lệ',
      fieldErrors,
    });
  }
}

/** Cú pháp gọn hơn cho chỗ dùng nhiều: `@Query(zodPipe(schema))`. */
export function zodPipe<TOutput>(schema: ZodType<TOutput>): ZodValidationPipe<TOutput> {
  return new ZodValidationPipe(schema);
}
