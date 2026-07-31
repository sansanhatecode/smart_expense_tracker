import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// quiet: tắt banner quảng cáo của dotenv v17 trong output của Prisma CLI
loadEnv({ quiet: true });

// Prisma 7 đọc connection string từ đây, không còn từ `url` trong schema.prisma.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
    // Neon: DATABASE_URL là pooled (-pooler), DIRECT_URL là direct — migrate cần direct.
    // Local Postgres thì hai cái giống nhau.
    directUrl: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
  },
});
