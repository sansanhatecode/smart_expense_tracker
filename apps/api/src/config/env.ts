import type { LogLevel } from '@nestjs/common';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({ quiet: true });

/**
 * Env được validate ngay lúc boot, không phải lúc dùng.
 *
 * Lý do: thiếu JWT_ACCESS_SECRET mà chỉ phát hiện khi có người bấm login là
 * kiểu lỗi tệ nhất — nó qua được deploy, qua được health check, rồi mới nổ vào
 * mặt người dùng. Ở đây process chết ngay với thông báo nói rõ thiếu biến nào.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL không được rỗng'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET cần ít nhất 32 ký tự (dùng: openssl rand -base64 48)'),
  /**
   * Định dạng của jsonwebtoken: '15m', '1h', '7d'. Regex ở đây là thứ biện minh
   * cho việc cast sang `SignOptions['expiresIn']` trong AuthModule — kiểu của
   * jsonwebtoken là template literal nên `string` không gán được.
   */
  ACCESS_TOKEN_TTL: z
    .string()
    .regex(/^\d+[smhd]$/, "ACCESS_TOKEN_TTL phải có dạng '15m', '1h', '7d'")
    .default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  /** Nhiều origin thì phân tách bằng dấu phẩy. Không nhận '*' vì có cookie. */
  WEB_ORIGIN: z.string().min(1).default('http://localhost:3000'),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(4 * 1024 * 1024),
  MAX_IMPORT_ROWS: z.coerce.number().int().positive().default(10_000),

  /**
   * Rate limit cho route auth. Mặc định 10/phút là mức cho production — đây là
   * chỗ bị brute-force nên siết chặt hơn phần còn lại của API.
   *
   * Cấu hình được qua env vì bộ test e2e chạy nhiều suite liên tiếp, mỗi suite
   * register vài user, và sẽ luôn vấp giới hạn thật. Nâng nó khi chạy test là
   * đúng chỗ để giải quyết — thay vì nới giới hạn trong code, hoặc bắt test chờ
   * hết cửa sổ 60 giây giữa mỗi suite.
   */
  AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),
  AUTH_THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),

  /**
   * Ngưỡng log: bật level này và mọi level nặng hơn.
   *
   * Không đặt default ở đây vì mặc định phụ thuộc NODE_ENV (xem `logLevels`):
   * dev cần `debug`, production thì `debug` chỉ làm phồng chi phí log mà gần như
   * không ai đọc.
   */
  LOG_LEVEL: z.enum(['verbose', 'debug', 'log', 'warn', 'error', 'fatal']).optional(),

  /**
   * Bật log câu SQL mà Prisma sinh ra. Mặc định tắt vì cực ồn — dùng khi cần
   * biết một endpoint chậm đang bắn bao nhiêu query (N+1 chẳng hạn).
   */
  LOG_SQL: z.stringbool().default(false),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(
      `Cấu hình môi trường không hợp lệ:\n${lines.join('\n')}\n\n` +
        `Xem apps/api/.env.example để biết cần những biến nào.`,
    );
  }

  return result.data;
}

export const env = parseEnv();

export type Env = typeof env;

export const isProduction = env.NODE_ENV === 'production';

/**
 * Các level được bật, theo đúng thứ tự Nest quy định (nhẹ → nặng).
 *
 * Nest nhận vào danh sách level bật chứ không nhận một ngưỡng, nên phải tự cắt:
 * chọn `warn` nghĩa là bật warn, error, fatal.
 */
const LEVELS = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'] as const;

export const logLevels: LogLevel[] = LEVELS.slice(
  LEVELS.indexOf(env.LOG_LEVEL ?? (isProduction ? 'log' : 'debug')),
);

/** Danh sách origin được phép gọi API kèm cookie. */
export const allowedOrigins: string[] = env.WEB_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);
