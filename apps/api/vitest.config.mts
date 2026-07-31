import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Phần lớn logic đáng test ở đây là pure function (parser, normalizer,
    // dedupe, categorizer) nên không cần environment gì đặc biệt.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
