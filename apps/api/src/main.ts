import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { allowedOrigins, env, isProduction, logLevels } from './config/env';

/** Entry point cho môi trường long-running: dev ở local, và Render khi deploy. */
async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // JSON ở production để log aggregator query được theo field, còn ở local thì
    // người đọc log là mình nên ưu tiên dạng có màu, dễ nhìn.
    logger: new ConsoleLogger({
      logLevels,
      json: isProduction,
      colors: !isProduction,
    }),
  });

  configureApp(app);
  app.enableShutdownHooks();

  await app.listen(env.PORT);

  const logger = new Logger('Bootstrap');
  logger.log(`API chạy ở http://localhost:${env.PORT}`);
  logger.log(`CORS cho phép: ${allowedOrigins.join(', ')}`);
  logger.log(`Log level: ${logLevels.join(', ')}${env.LOG_SQL ? ' (kèm SQL)' : ''}`);
}

/**
 * Hai loại lỗi này mặc định làm process chết mà không để lại gì trong log của
 * Nest — nhìn từ ngoài chỉ thấy service tự nhiên restart, không biết vì sao.
 */
function logFatalErrors(): void {
  const logger = new Logger('Process');

  process.on('unhandledRejection', (reason) => {
    logger.error(
      'Promise bị reject mà không ai catch',
      reason instanceof Error ? reason.stack : String(reason),
    );
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Lỗi không ai catch — thoát process', error.stack);
    // Không cố sống tiếp: sau uncaughtException, state của process không còn
    // đáng tin. Chết hẳn để Render (hoặc nodemon ở local) dựng lại process sạch
    // vẫn tốt hơn một API chạy nửa vời.
    process.exit(1);
  });
}

logFatalErrors();
void main();
