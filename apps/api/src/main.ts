import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { allowedOrigins, env, isProduction } from './config/env';

/** Entry point cho môi trường long-running: dev ở local, và Render khi deploy. */
async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: isProduction ? ['log', 'warn', 'error'] : ['log', 'warn', 'error', 'debug'],
  });

  configureApp(app);
  app.enableShutdownHooks();

  await app.listen(env.PORT);

  const logger = new Logger('Bootstrap');
  logger.log(`API chạy ở http://localhost:${env.PORT}`);
  logger.log(`CORS cho phép: ${allowedOrigins.join(', ')}`);
}

void main();
