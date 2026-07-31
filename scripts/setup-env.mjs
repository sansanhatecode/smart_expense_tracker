#!/usr/bin/env node
/**
 * Tạo file .env từ .env.example, sinh sẵn secret ngẫu nhiên.
 *
 * Tồn tại vì .env bị gitignore (đúng), nên mỗi lần clone mới hoặc dọn workspace
 * là app không chạy được với thông báo thiếu biến môi trường. Việc này lặp lại
 * đủ nhiều để đáng tự động hoá.
 *
 * Không ghi đè file .env đã có — chạy lại nhiều lần là an toàn.
 */
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  {
    example: join(root, 'apps/api/.env.example'),
    output: join(root, 'apps/api/.env'),
    secrets: ['thay-bang-secret-that'],
  },
  {
    example: join(root, 'apps/web/.env.example'),
    output: join(root, 'apps/web/.env.local'),
    secrets: [],
  },
];

let created = 0;

for (const target of targets) {
  const name = target.output.replace(`${root}/`, '');

  if (existsSync(target.output)) {
    console.log(`  đã có     ${name} (giữ nguyên)`);
    continue;
  }

  if (!existsSync(target.example)) {
    console.error(`  thiếu     ${target.example}`);
    process.exitCode = 1;
    continue;
  }

  if (target.secrets.length === 0) {
    copyFileSync(target.example, target.output);
  } else {
    let content = readFileSync(target.example, 'utf8');
    for (const placeholder of target.secrets) {
      content = content.replaceAll(placeholder, randomBytes(48).toString('base64'));
    }
    writeFileSync(target.output, content);
  }

  console.log(`  đã tạo    ${name}`);
  created += 1;
}

if (created > 0) {
  console.log('\nTiếp theo: npm run db:up && npm run db:migrate');
}
