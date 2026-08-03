import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { httpLogger } from './common/http-logger.middleware';
import { allowedOrigins } from './config/env';

/**
 * Toàn bộ cấu hình app, tách khỏi entry point.
 *
 * Lý do tách: ADR 9.9 nói API có thể chuyển giữa Render (long-running) và
 * serverless. Điều làm việc chuyển đó rẻ là mọi cấu hình nằm ở đây — entry point
 * nào cũng chỉ việc gọi hàm này, không ai phải nhớ "à còn phải bật cookieParser
 * nữa". Domain layer thì không biết mình đang chạy ở đâu.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  // Đứng đầu chuỗi middleware một cách có chủ ý: mọi thứ chạy sau nó đều nằm
  // trong request context, nên log ở bất cứ đâu cũng gắn được request id. Đặt
  // sau cookieParser thì thời gian đo được sẽ thiếu, và lỗi phát sinh trong
  // cookieParser sẽ không có id.
  app.use(httpLogger);

  app.use(cookieParser());

  // CORS phải liệt kê origin cụ thể, không dùng '*': có credentials nên browser
  // sẽ từ chối wildcard.
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  // Không có lý do gì nói cho người ngoài biết mình chạy framework nào.
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  return app;
}
