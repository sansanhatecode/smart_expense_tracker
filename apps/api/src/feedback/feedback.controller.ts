import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createFeedbackSchema,
  type CreateFeedbackInput,
  type FeedbackDto,
} from '@expense/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FeedbackService } from './feedback.service';

@Controller('api/feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  /**
   * Siết chặt hơn mức mặc định của app: mỗi request ở đây tạo một issue thật
   * trên repo. Một người báo lỗi hăng nhất cũng không cần quá 5 lần mỗi giờ, còn
   * script spam thì sẽ làm repo không dùng được nữa.
   *
   * Route KHÔNG `@Public()`: phải đăng nhập mới báo được, nên mỗi issue truy được
   * về một user và giới hạn ở trên có nghĩa.
   */
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createFeedbackSchema)) body: CreateFeedbackInput,
  ): Promise<FeedbackDto> {
    return this.feedback.create(user, body);
  }
}
