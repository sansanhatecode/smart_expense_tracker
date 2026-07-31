import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiErrorBody } from '@expense/shared';
import type { Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client';
import { isProduction } from '../config/env';

/**
 * Mọi lỗi ra khỏi API đều mang đúng một shape (`ApiErrorBody`), để FE chỉ cần
 * một chỗ xử lý lỗi thay vì đoán xem lần này server trả về kiểu gì.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.toErrorBody(exception);

    // 5xx là bug của mình → log kèm stack. 4xx là lỗi của request → không cần.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private toErrorBody(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // ZodValidationPipe ném object { message, fieldErrors }
      if (typeof payload === 'object' && payload !== null) {
        const record = payload as Record<string, unknown>;
        const message =
          typeof record['message'] === 'string' ? record['message'] : exception.message;
        const fieldErrors = record['fieldErrors'] as ApiErrorBody['fieldErrors'] | undefined;

        return {
          status,
          body: { statusCode: status, message, ...(fieldErrors ? { fieldErrors } : {}) },
        };
      }

      return { status, body: { statusCode: status, message: String(payload) } };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception);
    }

    // BigInt lọt ra tới JSON.stringify là bug của mapper — cố tình để nó nổ
    // thành 500 rõ ràng thay vì âm thầm trả số sai. Xem ADR 9.3.
    if (exception instanceof TypeError && /BigInt/i.test(exception.message)) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: isProduction
            ? 'Lỗi hệ thống'
            : 'BigInt chưa được chuyển sang number ở tầng mapper trước khi trả về',
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: isProduction
          ? 'Lỗi hệ thống'
          : exception instanceof Error
            ? exception.message
            : String(exception),
      },
    };
  }

  private fromPrismaError(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    body: ApiErrorBody;
  } {
    switch (error.code) {
      // Vi phạm unique constraint
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          body: { statusCode: 409, message: conflictMessage(error.meta?.['target']) },
        };
      // Vi phạm foreign key — thường là categoryId trỏ vào danh mục không tồn tại
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          body: { statusCode: 400, message: 'Tham chiếu tới dữ liệu không tồn tại' },
        };
      // Không tìm thấy record để update/delete
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          body: { statusCode: 404, message: 'Không tìm thấy dữ liệu' },
        };
      default:
        this.logger.error(`Lỗi Prisma chưa xử lý: ${error.code}`, error.stack);
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: {
            statusCode: 500,
            message: isProduction ? 'Lỗi hệ thống' : `Lỗi database: ${error.code}`,
          },
        };
    }
  }
}

/**
 * Dịch unique constraint bị vi phạm thành câu người dùng hiểu được.
 *
 * Không trả thẳng tên field của Prisma ra ngoài: "Dữ liệu đã tồn tại (userId,
 * keyword)" vừa lộ cấu trúc nội bộ vừa không nói cho người dùng biết phải sửa gì.
 */
function conflictMessage(target: unknown): string {
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  const has = (field: string): boolean => fields.some((f) => f.includes(field));

  if (has('dedupeHash')) return 'Giao dịch này đã tồn tại';
  if (has('keyword')) return 'Đã có rule cho keyword này — hãy sửa rule sẵn có thay vì tạo mới';
  if (has('email')) return 'Email này đã được đăng ký';
  if (has('name')) return 'Đã có danh mục cùng tên và cùng loại thu/chi';
  if (has('month')) return 'Đã có ngân sách cho danh mục này trong kỳ đó';
  return 'Dữ liệu đã tồn tại';
}
